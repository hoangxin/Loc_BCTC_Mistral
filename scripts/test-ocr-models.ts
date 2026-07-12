import { existsSync } from 'fs';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { containsNotesSectionMarker, parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { validateFinancialStatements } from '../lib/export/validate-statements';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

// Gia $/1M token (input/output) - tra cuu OpenRouter 2026-07-08, co the da doi.
// deepseek/deepseek-v4-flash BO KHOI danh sach (2026-07-08) - kiem tra qua
// GET /api/v1/models: KHONG co model deepseek nao tren OpenRouter co
// "image" trong architecture.input_modalities - goi vision se 404 "No
// endpoints found that support image input", khong phai loi cau hinh.
const MODELS: { id: string; inputPer1M: number; outputPer1M: number }[] = [
  { id: 'qwen/qwen3-vl-8b-instruct', inputPer1M: 0.117, outputPer1M: 0.455 },
  { id: 'qwen/qwen3-vl-235b-a22b-instruct', inputPer1M: 0.13, outputPer1M: 0.52 },
  { id: 'google/gemini-3-flash-preview', inputPer1M: 0.5, outputPer1M: 3.0 },
];

const SYSTEM_PROMPT = `Ban la cong cu OCR chuyen doi trang PDF bao cao tai chinh tieng Viet thanh markdown.
Yeu cau BAT BUOC:
- Transcribe TOAN BO noi dung tung trang duoc gui, THEO DUNG THU TU trang.
- Voi moi bang so lieu, dung DUNG cu phap bang markdown chuan (| cell | cell | ...), giu nguyen tat ca cac cot va hang, KHONG bo sot dong nao, KHONG lam tron/doi so lieu.
- Moi tieu de muc lon (vd ten bao cao) dat rieng tren 1 dong NGAN (duoi 80 ky tu), khong ghep vao cau van.
- KHONG tom tat, KHONG giai thich, KHONG them binh luan cua ban - chi tra ve markdown transcribe duoc.`;

const USER_TEXT = 'Chuyen doi cac trang anh sau (theo dung thu tu) thanh markdown nhu huong dan trong system prompt.';

interface ModelResult {
  model: string;
  ok: boolean;
  error?: string;
  warnings?: string[];
  hasBalanceSheet?: boolean;
  hasIncomeStatement?: boolean;
  hasCashFlow?: boolean;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  elapsedMs?: number;
}

async function callVisionModel(modelId: string, images: string[]): Promise<{ text: string; usage: any }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Thieu OPENROUTER_API_KEY');

  const content = [
    { type: 'text', text: USER_TEXT },
    ...images.map((base64) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } })),
  ];

  const body = JSON.stringify({
    model: modelId,
    max_tokens: 16000,
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
  });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'X-Title': 'Loc BCTC - OCR model test',
    },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Request failed (${response.status})`);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response content: ' + JSON.stringify(data).slice(0, 500));
  return { text, usage: data.usage };
}

function slugify(modelId: string): string {
  return modelId.replace(/[/.]/g, '-');
}

(async () => {
  const images: string[] = JSON.parse(await readFile('scripts/out/tix-pages-base64.json', 'utf-8'));
  console.log(`Loaded ${images.length} page images.`);

  const results: ModelResult[] = [];

  for (const m of MODELS) {
    console.log(`\n=== Testing ${m.id} ===`);
    const start = Date.now();
    try {
      const { text, usage } = await callVisionModel(m.id, images);
      const elapsedMs = Date.now() - start;
      await writeFile(`scripts/out/tix-${slugify(m.id)}.md`, text);

      const statements = parseStatementsFromMarkdown(text);
      const issues = validateFinancialStatements(statements, 'other');
      const promptTokens = usage?.prompt_tokens ?? 0;
      const completionTokens = usage?.completion_tokens ?? 0;
      const costUsd = (promptTokens / 1_000_000) * m.inputPer1M + (completionTokens / 1_000_000) * m.outputPer1M;

      results.push({
        model: m.id,
        ok: true,
        warnings: issues.map((i) => i.message),
        hasBalanceSheet: statements.balanceSheet.rows.length > 0,
        hasIncomeStatement: statements.incomeStatement.rows.length > 0,
        hasCashFlow: statements.cashFlow.rows.length > 0,
        promptTokens,
        completionTokens,
        costUsd,
        elapsedMs,
      });
      console.log(`OK - ${elapsedMs}ms, tokens in=${promptTokens} out=${completionTokens}, cost=$${costUsd.toFixed(4)}`);
      console.log(`  balanceSheet rows=${statements.balanceSheet.rows.length}, incomeStatement rows=${statements.incomeStatement.rows.length}, cashFlow rows=${statements.cashFlow.rows.length}`);
      console.log(`  warnings: ${issues.map((i) => i.message).join(' | ') || '(none)'}`);
    } catch (error) {
      const elapsedMs = Date.now() - start;
      results.push({ model: m.id, ok: false, error: error instanceof Error ? error.message : String(error), elapsedMs });
      console.log(`FAILED - ${error instanceof Error ? error.message : error}`);
    }
  }

  await writeFile('scripts/out/comparison-results.json', JSON.stringify(results, null, 2));
  console.log('\n\nSaved full results to scripts/out/comparison-results.json');
})();

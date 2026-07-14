// Vong 2 so sanh model (2026-07-08, xem README/memory reference_mistral_batch_api)
// - da CHOT dung Mistral, script nay chi con gia tri lich su. Can
// `scripts/out/tix-pages-base64.json` co san TRUOC khi chay (khong co script
// nao trong repo tu sinh file nay nua) - KHONG chay thang duoc neu chua tu
// tao lai file input do.
import { existsSync } from 'fs';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { validateFinancialStatements } from '../lib/export/validate-statements';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const BASE_SYSTEM_PROMPT = `Ban la cong cu OCR chuyen doi trang PDF bao cao tai chinh tieng Viet thanh markdown.
Yeu cau BAT BUOC:
- Transcribe TOAN BO noi dung tung trang duoc gui, THEO DUNG THU TU trang.
- Voi moi bang so lieu, dung DUNG cu phap bang markdown chuan (| cell | cell | ...), giu nguyen tat ca cac cot va hang, KHONG bo sot dong nao, KHONG lam tron/doi so lieu.
- Moi tieu de muc lon (vd ten bao cao) dat rieng tren 1 dong NGAN (duoi 80 ky tu), khong ghep vao cau van.
- KHONG tom tat, KHONG giai thich, KHONG them binh luan cua ban - chi tra ve markdown transcribe duoc.`;

// Them huong dan cu the ve loi "gop/mat cot" da do duoc that (qwen3-vl lam mat
// 2/4 cot so o dong nhieu cot cua Ket qua kinh doanh - quy nay/nam truoc x quy/luy ke).
const IMPROVED_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}
- CANH BAO QUAN TRONG: bang "KET QUA HOAT DONG KINH DOANH" thuong co 4-5 COT SO rieng biet cung 1 hang (vd: Ky nay/Luy ke - Nam nay/Nam truoc) - dem CHINH XAC so cot so trong dong tieu de bang (hang "Ma so" hoac hang chua "Ky nay"/"Luy ke") TRUOC KHI dien du lieu, dam bao MOI hang du lieu co DUNG so luong cot do - KHONG duoc gop 2 cot thanh 1, KHONG duoc bo sot cot nao du gia tri co the giong nhau giua cac cot.
- Sau khi transcribe xong 1 bang, tu kiem lai: so cot cua TUNG HANG du lieu co khop voi so cot cua hang tieu de khong - neu thieu, doc lai anh va bo sung.`;

const USER_TEXT = 'Chuyen doi cac trang anh sau (theo dung thu tu) thanh markdown nhu huong dan trong system prompt.';

interface RunConfig {
  label: string;
  model: string;
  systemPrompt: string;
  inputPer1M: number;
  outputPer1M: number;
}

const RUNS: RunConfig[] = [
  {
    label: 'qwen3-vl-235b (improved prompt)',
    model: 'qwen/qwen3-vl-235b-a22b-instruct',
    systemPrompt: IMPROVED_SYSTEM_PROMPT,
    inputPer1M: 0.13,
    outputPer1M: 0.52,
  },
  {
    label: 'gemini-2.5-flash-lite (base prompt)',
    model: 'google/gemini-2.5-flash-lite',
    systemPrompt: BASE_SYSTEM_PROMPT,
    inputPer1M: 0.1,
    outputPer1M: 0.4,
  },
];

async function callVisionModel(modelId: string, systemPrompt: string, images: string[]): Promise<{ text: string; usage: any }> {
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
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
  });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'X-Title': 'Loc BCTC - OCR model test round 2',
    },
    body,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status})`);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response content: ' + JSON.stringify(data).slice(0, 500));
  return { text, usage: data.usage };
}

function slugify(s: string): string {
  return s.replace(/[/.() ]/g, '-');
}

(async () => {
  const images: string[] = JSON.parse(await readFile('scripts/out/tix-pages-base64.json', 'utf-8'));
  console.log(`Loaded ${images.length} page images.`);

  for (const run of RUNS) {
    console.log(`\n=== ${run.label} ===`);
    const start = Date.now();
    try {
      const { text, usage } = await callVisionModel(run.model, run.systemPrompt, images);
      const elapsedMs = Date.now() - start;
      await writeFile(`scripts/out/tix-round2-${slugify(run.label)}.md`, text);

      const statements = parseStatementsFromMarkdown(text);
      const issues = validateFinancialStatements(statements, 'other');
      const promptTokens = usage?.prompt_tokens ?? 0;
      const completionTokens = usage?.completion_tokens ?? 0;
      const costUsd = (promptTokens / 1_000_000) * run.inputPer1M + (completionTokens / 1_000_000) * run.outputPer1M;

      console.log(`OK - ${elapsedMs}ms, tokens in=${promptTokens} out=${completionTokens}, cost=$${costUsd.toFixed(4)} (~$${(costUsd * 100).toFixed(2)}/100 reports)`);
      console.log(`  balanceSheet rows=${statements.balanceSheet.rows.length}, incomeStatement rows=${statements.incomeStatement.rows.length}, cashFlow rows=${statements.cashFlow.rows.length}`);
      console.log(`  warnings (${issues.length}): ${issues.map((i) => i.message).join(' | ') || '(none)'}`);
    } catch (error) {
      console.log(`FAILED - ${error instanceof Error ? error.message : error}`);
    }
  }
})();

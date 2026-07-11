import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { basename, extname, join } from 'path';
import axios from 'axios';
import { getPreviousQuarter } from './quarter';
import { callMistralChat } from './ai/mistral-chat';
import { resolveReportSourceFiles, cleanupDownloadedFile } from './report-source';
import { extractReportContent } from './report-extract';
import { computeAnalysisRows } from './analysis';
import { classifyStatementScope } from './statement-scope';
import { normalizeLabelText } from './export/statement-shared';
import { addCustomReport, writeCustomSourceCheck } from './pipeline';
import type { ReportFile } from './vietstock-reports';
import type { DownloadedReport, FetchStatus } from './status';

// Nut "Them nguon rieng" (paste link web cong ty) - dung AI (Mistral chat,
// xem lib/ai/mistral-chat.ts) duyet trang de tu tim file BCTC quy vua ket
// thuc, vi khac Vietstock (co API JSON co cau truc san), website tung cong ty
// khong co quy uoc chung nao - phai "doc hieu" trang nhu nguoi that. Toi da
// MAX_HOPS lan nhay trang (vd tu trang chu -> "Quan he co dong" -> "Bao cao
// tai chinh") truoc khi ket luan "Chua co".
const MAX_HOPS = 4;
const MAX_LINKS_SENT_TO_AI = 150;
const MAX_PAGE_TEXT_CHARS = 6000;
const REQUEST_TIMEOUT_MS = 15000;

export type CustomSourceResult = { found: true; report: DownloadedReport } | { found: false; message: string };

interface PageLink {
  href: string;
  text: string;
}

interface BrowseDecision {
  action: 'download' | 'visit' | 'not_found';
  url?: string;
  companyNameGuess?: string;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const RELEVANT_KEYWORDS = ['BAO CAO TAI CHINH', 'BCTC', 'QUAN HE CO DONG', 'NHA DAU TU', 'INVESTOR', 'FINANCIAL', 'REPORT', 'QUY'];

// Uu tien link "co ve lien quan" len dau (dua theo tu khoa trong text/href) -
// vi trang web that co the co hang tram link, chi gui toi da
// MAX_LINKS_SENT_TO_AI link cho AI (tranh prompt qua dai/ton token), khong
// muon cat mat dung link lien quan chi vi no nam cuoi trang.
function rankLinks(links: PageLink[]): PageLink[] {
  return [...links]
    .map((link) => {
      const normalized = normalizeLabelText(`${link.text} ${link.href}`);
      const score = RELEVANT_KEYWORDS.reduce((acc, kw) => acc + (normalized.includes(kw) ? 1 : 0), 0);
      return { link, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.link);
}

function extractPageContent(html: string, baseUrl: string): { text: string; links: PageLink[] } {
  const withoutScriptsAndStyles = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const seen = new Set<string>();
  const links: PageLink[] = [];
  for (const match of withoutScriptsAndStyles.matchAll(/<a\s+[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let absolute: string;
    try {
      absolute = new URL(match[1].trim(), baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(absolute) || seen.has(absolute)) continue;
    seen.add(absolute);
    const text = htmlToPlainText(match[2]).trim();
    links.push({ href: absolute, text: text || absolute });
  }

  return { text: htmlToPlainText(withoutScriptsAndStyles).slice(0, MAX_PAGE_TEXT_CHARS), links: rankLinks(links).slice(0, MAX_LINKS_SENT_TO_AI) };
}

async function askMistralForReportLink(input: {
  quarter: number;
  year: number;
  pageUrl: string;
  pageText: string;
  links: PageLink[];
}): Promise<BrowseDecision> {
  const linksList = input.links.map((link, i) => `${i + 1}. [${link.text}](${link.href})`).join('\n');
  const prompt = `Bạn đang giúp tìm file BÁO CÁO TÀI CHÍNH (BCTC) Quý ${input.quarter}/${input.year} của 1 công ty trên website của chính công ty đó.

Trang đang xem: ${input.pageUrl}

Nội dung trang (rút gọn):
"""
${input.pageText}
"""

Danh sách link trên trang (đã đánh số):
${linksList}

Trả lời ĐÚNG 1 JSON object, không giải thích gì thêm, theo đúng 1 trong 3 dạng:
- Nếu THẤY link tải trực tiếp file BCTC Quý ${input.quarter}/${input.year} (PDF hoặc Word): {"action": "download", "url": "<link tải file>", "companyNameGuess": "<tên công ty nếu đoán được, không thì bỏ qua>"}
- Nếu CHƯA thấy nhưng có link có thể dẫn tới trang chứa BCTC (vd "Quan hệ cổ đông", "Báo cáo tài chính", "Nhà đầu tư"): {"action": "visit", "url": "<link đó>"}
- Nếu KHÔNG có dấu hiệu gì liên quan: {"action": "not_found"}`;

  try {
    const raw = await callMistralChat(
      [
        { role: 'system', content: 'Bạn là trợ lý tìm kiếm tài liệu trên website doanh nghiệp, chỉ trả về JSON, không trả lời gì khác.' },
        { role: 'user', content: prompt },
      ],
      { jsonMode: true }
    );
    const parsed = JSON.parse(raw);
    if (parsed?.action === 'download' || parsed?.action === 'visit' || parsed?.action === 'not_found') {
      return parsed as BrowseDecision;
    }
  } catch (error) {
    console.error('custom-source: AI tra ve khong hop le', error);
  }
  return { action: 'not_found' };
}

async function downloadFile(fileUrl: string, destDir: string): Promise<string> {
  await mkdir(destDir, { recursive: true });
  const rawName = basename(new URL(fileUrl).pathname) || 'bctc';
  const filePath = join(destDir, `${Date.now()}-${decodeURIComponent(rawName)}`);

  const response = await axios.get(fileUrl, { responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: REQUEST_TIMEOUT_MS });
  await new Promise<void>((resolve, reject) => {
    const writer = createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on('finish', () => resolve());
    writer.on('error', reject);
  });
  return filePath;
}

// Tai + trich 3 bang 1 file BCTC tim duoc qua link nguon rieng - CHI trich 3
// bang (KHONG OCR toan van/ghi file xuat o day nua, xem lib/pipeline.ts va
// lib/export/full-document.ts - OCR toan van gio la buoc RIENG, chi lam luc
// user bam "Xuat" cho 1 bao cao cu the qua app/api/report-file).
async function downloadAndProcessCustomReport(fileUrl: string, companyNameGuess: string | undefined): Promise<DownloadedReport> {
  const destDir = join(process.cwd(), 'data', 'reports', 'custom');
  const filePath = await downloadFile(fileUrl, destDir);

  // try/finally: da OCR xong (hoac loi giua chung) deu xoa file goc - khong
  // con dung toi nua (xem lib/report-source.ts cleanupDownloadedFile).
  try {
    const fakeReportFile: ReportFile = {
      fileInfoID: 0,
      stockCode: '',
      exchange: '',
      companyName: companyNameGuess?.trim() || new URL(fileUrl).hostname,
      financeUrl: fileUrl,
      fileUrl,
      title: 'Nguồn riêng',
      fullName: basename(filePath),
      fileExt: extname(filePath),
      lastUpdate: new Date(),
    };

    const { resolved, errors } = await resolveReportSourceFiles({ report: fakeReportFile, filePath });
    if (resolved.length === 0) {
      throw new Error(errors.join('; ') || 'Không nhận diện được định dạng file (chỉ hỗ trợ PDF/DOCX/DOC/ZIP/RAR)');
    }

    // Nguon rieng chi ung voi 1 cong ty/1 lan paste link - neu zip/rar chua
    // nhieu file, chi lay file DAU TIEN (khac batch Vietstock, xem lib/pipeline.ts,
    // vi o day khong co "danh sach nhieu cong ty" de tach dong rieng).
    const resolvedFile = resolved[0];
    const content = await extractReportContent(resolvedFile);
    const { quarter, year } = getPreviousQuarter();

    return {
      source: 'custom',
      stockCode: fakeReportFile.stockCode,
      exchange: fakeReportFile.exchange,
      companyName: fakeReportFile.companyName,
      title: fakeReportFile.title,
      lastUpdate: fakeReportFile.lastUpdate.toISOString(),
      statementScope: classifyStatementScope({ metadataText: resolvedFile.entryName ?? '', contentText: content.fullText ?? undefined }),
      businessType: content.businessType,
      analysis: computeAnalysisRows(content.statements, content.businessType, content.unreliableIncomeStatementCells),
      statements: content.statements,
      financeUrl: fileUrl,
      fileUrl,
      filePath: resolvedFile.filePath,
      format: resolvedFile.format,
      entryName: resolvedFile.entryName ?? null,
      periodYear: year,
      periodSlug: `Q${quarter}`,
      warnings: content.warnings,
    };
  } finally {
    await cleanupDownloadedFile(filePath);
  }
}

async function browseForReport(startUrl: string): Promise<CustomSourceResult> {
  const { quarter, year } = getPreviousQuarter();
  const visited = new Set<string>();
  let currentUrl = startUrl;

  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (visited.has(currentUrl)) break;
      visited.add(currentUrl);

      let html: string;
      try {
        const response = await axios.get<string>(currentUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: REQUEST_TIMEOUT_MS });
        html = response.data;
      } catch (error) {
        console.error('custom-source: khong tai duoc trang', currentUrl, error);
        break;
      }

      const { text, links } = extractPageContent(html, currentUrl);
      const decision = await askMistralForReportLink({ quarter, year, pageUrl: currentUrl, pageText: text, links });

      if (decision.action === 'download' && decision.url) {
        let absoluteUrl: string;
        try {
          absoluteUrl = new URL(decision.url, currentUrl).toString();
        } catch {
          break;
        }
        const report = await downloadAndProcessCustomReport(absoluteUrl, decision.companyNameGuess);
        return { found: true, report };
      }

      if (decision.action === 'visit' && decision.url) {
        try {
          const nextUrl = new URL(decision.url, currentUrl).toString();
          if (!visited.has(nextUrl)) {
            currentUrl = nextUrl;
            continue;
          }
        } catch {
          // URL AI tra ve khong hop le - dung duyet, roi ve "Chua co" o duoi.
        }
      }

      break; // not_found, hoac url khong hop le
    }
  } catch (error) {
    console.error('custom-source: loi khong luong truoc', startUrl, error);
  }

  return { found: false, message: 'Chưa có' };
}

// Diem vao goi tu scripts/run-fetch.ts (mode=custom, chay tren GitHub Actions
// runner - xem .github/workflows/fetch-bctc.yml) - LUON ghi lai
// lastCustomSourceCheck (ke ca found:false) qua writeCustomSourceCheck, day la
// cach DUY NHAT app/CustomSourceForm.tsx (polling app/api/fetch-status) biet
// duoc "da chay xong" thay vi cho toi khi het thoi gian poll.
export async function runCustomSourceCheck(url: string, requestId: string): Promise<FetchStatus> {
  const result = await browseForReport(url);

  if (result.found) {
    addCustomReport(result.report);
    return writeCustomSourceCheck({ requestId, url, found: true, message: '' });
  }

  return writeCustomSourceCheck({ requestId, url, found: false, message: result.message });
}

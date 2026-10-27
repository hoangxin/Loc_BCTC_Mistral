import { NextResponse } from 'next/server';
import { emptyMarksDoc, isMarksDoc, mergeMarksDocs, type MarksDoc } from '@/lib/report-marks';

export const dynamic = 'force-dynamic';

// Luu danh dau thu cong cua nguoi dung VAO CHINH REPO qua GitHub API, de no
// khong con phu thuoc localStorage cua 1 trinh duyet (xem lib/report-marks.ts
// ve su co mat du lieu 2026-10-27).
//
// Ghi vao 1 NHANH RIENG chu khong phai `main`: moi commit vao main deu kich
// hoat 1 lan deploy Vercel, ma danh dau thi duoc ghi lien tuc trong luc doc
// bao cao - de o main se vua lam ban lich su main vua deploy lai ca ngay.
const OWNER = 'hoangxin';
const REPO = 'Loc_BCTC_Mistral';
const BRANCH = 'user-marks';
const FILE_PATH = 'data/report-marks.json';

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

interface ContentsResponse {
  content?: string;
  sha?: string;
}

async function readRemote(token: string): Promise<{ doc: MarksDoc; sha: string | null }> {
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}&t=${Date.now()}`,
    { headers: headers(token), cache: 'no-store' }
  );
  if (response.status === 404) return { doc: emptyMarksDoc(), sha: null };
  if (!response.ok) throw new Error(`Doc that bai (${response.status})`);
  const data = (await response.json()) as ContentsResponse;
  if (!data.content) return { doc: emptyMarksDoc(), sha: data.sha ?? null };
  const parsed: unknown = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  return { doc: isMarksDoc(parsed) ? parsed : emptyMarksDoc(), sha: data.sha ?? null };
}

// Nhanh luu danh dau duoc tao tu commit goc cua main NEU chua ton tai - de no
// khong keo theo toan bo cay thu muc nao khac va khong anh huong main.
async function ensureBranch(token: string) {
  const exists = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, {
    headers: headers(token),
    cache: 'no-store',
  });
  if (exists.ok) return;
  const main = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/main`, {
    headers: headers(token),
    cache: 'no-store',
  });
  if (!main.ok) throw new Error(`Khong doc duoc nhanh main (${main.status})`);
  const sha = ((await main.json()) as { object?: { sha?: string } }).object?.sha;
  const created = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs`, {
    method: 'POST',
    headers: { ...headers(token), 'content-type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha }),
  });
  if (!created.ok && created.status !== 422) throw new Error(`Khong tao duoc nhanh ${BRANCH} (${created.status})`);
}

export async function GET() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'Thiếu GITHUB_DISPATCH_TOKEN trên server.' }, { status: 503 });
  try {
    const { doc } = await readRemote(token);
    return NextResponse.json({ ok: true, doc });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'Thiếu GITHUB_DISPATCH_TOKEN trên server.' }, { status: 503 });

  let incoming: unknown;
  try {
    incoming = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Dữ liệu gửi lên không đọc được.' }, { status: 400 });
  }
  if (!isMarksDoc(incoming)) {
    return NextResponse.json({ ok: false, error: 'Dữ liệu gửi lên sai định dạng.' }, { status: 400 });
  }

  try {
    await ensureBranch(token);
    // GOP voi ban dang nam tren server thay vi ghi de - 2 may/2 tab dong bo
    // lech nhau van cong don dung (xem mergeMarksDocs).
    const { doc: remote, sha } = await readRemote(token);
    const merged = mergeMarksDocs(remote, { ...incoming, updatedAt: new Date().toISOString() });
    const body = {
      message: `chore: cap nhat danh dau nguoi dung (${Object.keys(merged.marks).length} muc)`,
      content: Buffer.from(JSON.stringify(merged, null, 2), 'utf-8').toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    };
    const saved = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: { ...headers(token), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!saved.ok) {
      const text = await saved.text();
      console.error('report-marks PUT error', saved.status, text.slice(0, 300));
      const hint =
        saved.status === 403 || saved.status === 404
          ? ' (token có thể thiếu quyền ghi nội dung repo)'
          : '';
      return NextResponse.json({ ok: false, error: `Không lưu được lên repo (${saved.status})${hint}.` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, doc: merged });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

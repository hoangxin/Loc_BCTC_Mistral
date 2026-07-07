// Dispatch chung cho .github/workflows/fetch-bctc.yml - dung boi
// app/api/trigger-fetch (mode=term), app/api/custom-source (mode=custom, xem
// lib/custom-source.ts - KHONG qua day, tu goi rieng) va app/api/clear-results
// (mode=clear) - tach rieng file nay (2026-07-08) de khong lap lai logic
// dispatch+tim run id o nhieu route.
const OWNER = 'hoangxin';
const REPO = 'Loc_BCTC_Mistral';
const WORKFLOW_FILE = 'fetch-bctc.yml';
const RUN_LOOKUP_ATTEMPTS = 8;
const RUN_LOOKUP_DELAY_MS = 500;

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

interface WorkflowRun {
  id: number;
  created_at: string;
}

// workflow_dispatch tra ve 204 khong co run id - phai poll danh sach run gan
// nhat de tim dung lan vua kich hoat (dung cho tinh nang Huy sau nay, chua co
// UI goi toi ngay bay gio).
async function findDispatchedRunId(token: string, dispatchedAt: number): Promise<number | null> {
  for (let attempt = 0; attempt < RUN_LOOKUP_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, RUN_LOOKUP_DELAY_MS));
    try {
      const response = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=5`,
        { headers: githubHeaders(token) }
      );
      if (!response.ok) continue;
      const data = (await response.json()) as { workflow_runs?: WorkflowRun[] };
      const run = (data.workflow_runs ?? []).find((r) => new Date(r.created_at).getTime() >= dispatchedAt - 5000);
      if (run) return run.id;
    } catch {
      // loi tam thoi khi poll danh sach run - thu lai vong sau
    }
  }
  return null;
}

export interface DispatchResult {
  ok: boolean;
  runId?: number | null;
  error?: string;
  status?: number;
}

export async function dispatchFetchWorkflow(inputs: Record<string, string>): Promise<DispatchResult> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return { ok: false, error: 'Thiếu GITHUB_DISPATCH_TOKEN trên server.', status: 500 };
  }

  const dispatchedAt = Date.now();
  const dispatchResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: 'POST',
    headers: { ...githubHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs }),
  });

  if (!dispatchResponse.ok) {
    const text = await dispatchResponse.text();
    console.error('dispatchFetchWorkflow error', dispatchResponse.status, text);
    return { ok: false, error: `Không kích hoạt được workflow (${dispatchResponse.status}).`, status: 500 };
  }

  const runId = await findDispatchedRunId(token, dispatchedAt);
  return { ok: true, runId };
}

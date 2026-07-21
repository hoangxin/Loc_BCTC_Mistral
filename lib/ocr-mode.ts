// Kieu OCR dung cho 1 lan "Tai BCTC"/"Them nguon rieng" - nguoi dung chon
// tren UI (app/FetchControls.tsx, app/CustomSourceForm.tsx), truyen xuyen
// suot qua GitHub Actions (.github/workflows/fetch-bctc.yml, env FETCH_OCR_MODE)
// toi lib/export/financial-statements.ts, noi thuc su re nhanh goi
// callMistralOcr (sync, lib/ai/mistral-ocr.ts) hoac callMistralOcrBatch
// (batch, lib/ai/mistral-ocr-batch.ts). Them 2026-07-21 sau su co Mistral
// batch nghen keo dai nhieu gio (xem memory project_mistral_congestion_2026-07-20) -
// truoc day CHI co batch (hard-code, doi qua sync phai sua code + deploy lai).
export type OcrMode = 'sync' | 'batch';

// Batch la mac dinh (gia re hon ~50%, dung on dinh truoc dot nghen 20/7) - giu
// nguyen hanh vi cu cho MOI noi goi khong truyen ocrMode ro rang (cac script
// debug/refetch 1 bao cao rieng, vd scripts/refetch-acg.ts).
export const DEFAULT_OCR_MODE: OcrMode = 'batch';

export function parseOcrMode(value: string | undefined | null): OcrMode {
  return value === 'sync' ? 'sync' : DEFAULT_OCR_MODE;
}

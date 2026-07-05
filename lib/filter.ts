import type { ReportFile } from './vietstock-reports';

// Cho AI dung sau nay neu tieu chi loc can doc/phan loai noi dung (vd Qwen
// dang duoc dung cho lib/digest.ts o 2 project loc_tin) - hien chua wire vao
// dau vi tieu chi loc thuc te chua duoc chot.
// import { callQwen } from './ai/qwen';
// import { callClaude } from './ai/claude'; // du phong - doi sang Claude khi can

// TODO: thay bang tieu chi loc rieng cua user (se duoc bo sung trong luc code).
// Hien tai giu nguyen toan bo danh sach de pipeline chay duoc end-to-end.
export function filterReports(reports: ReportFile[]): ReportFile[] {
  return reports;
}

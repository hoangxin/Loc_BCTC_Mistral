import axios from 'axios';

const BASE_URL = 'https://finance.vietstock.vn';
const REPORT_PAGE_URL = `${BASE_URL}/tai-lieu/bao-cao-tai-chinh.htm`;
// DocumentTypeID cua "Bao cao tai chinh" tra ve tu POST /data/getrptdoctype -
// on dinh, hardcode luon de khoi mat 1 request moi lan chay.
const FINANCIAL_STATEMENT_DOC_TYPE_ID = 1;
const PAGE_SIZE = 50;
const USER_AGENT = 'Mozilla/5.0';

export interface ReportTerm {
  yearPeriod: number;
  reportTermID: number;
  description: string;
}

export interface ReportFile {
  fileInfoID: number;
  stockCode: string;
  exchange: string;
  companyName: string;
  financeUrl: string;
  fileUrl: string;
  title: string;
  fullName: string;
  fileExt: string;
  lastUpdate: Date;
}

interface Session {
  cookieHeader: string;
  requestVerificationToken: string;
}

// Cac endpoint /data/* cua Vietstock duoc bao ve boi ASP.NET anti-forgery
// kieu double-submit cookie: gia tri cookie va gia tri hidden field khac
// nhau nhung phai gui kem nhau - phai GET 1 trang thuong truoc de lay cap
// token nay.
async function getSession(): Promise<Session> {
  const response = await axios.get<string>(REPORT_PAGE_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });

  const setCookie = (response.headers['set-cookie'] as string[] | undefined) || [];
  const cookieHeader = setCookie.map((cookie) => cookie.split(';')[0]).join('; ');

  const tokenMatch = response.data.match(/name=__RequestVerificationToken type=hidden value=([^ >]+)/);
  if (!cookieHeader || !tokenMatch) {
    throw new Error('vietstock: khong lay duoc session/token tu trang bao-cao-tai-chinh.htm');
  }

  return { cookieHeader, requestVerificationToken: tokenMatch[1] };
}

async function postForm<T>(session: Session, path: string, form: Record<string, string | number>): Promise<T> {
  const body = new URLSearchParams(
    Object.fromEntries(Object.entries(form).map(([key, value]) => [key, String(value)]))
  ).toString();

  const response = await axios.post<T>(`${BASE_URL}${path}`, body, {
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: session.cookieHeader,
      'content-type': 'application/x-www-form-urlencoded',
    },
  });

  return response.data;
}

interface RawReportTerm {
  YearPeriod: number;
  ReportTermID: number;
  Description: string;
}

// ReportTermID KHONG phai mapping co dinh quy->id (no la 1 chuoi so tang
// dan toan he thong) - cach an toan de tim "Quy N nam YYYY" la doi chieu
// dung nhan tieng Viet + nam trong danh sach ky bao cao gan nhat.
export async function findReportTerm(session: Session, quarter: number, year: number): Promise<ReportTerm | null> {
  const terms = await postForm<RawReportTerm[]>(session, '/data/getrptterm', {
    documentTypeID: FINANCIAL_STATEMENT_DOC_TYPE_ID,
    top: 8,
  });

  const label = `Quý ${quarter}`;
  const match = terms.find((term) => term.YearPeriod === year && term.Description === label);
  if (!match) return null;

  return { yearPeriod: match.YearPeriod, reportTermID: match.ReportTermID, description: match.Description };
}

interface RawReportFile {
  FileInfoID: number;
  StockCode: string;
  CatID: string;
  CompanyName: string;
  FinanceURL: string;
  Url: string;
  Title: string;
  FullName: string;
  TotalRow: number;
  FileExt: string;
  LastUpdate: string;
}

// Dinh dang ngay kieu ASP.NET MVC JSON: "/Date(1234567890000)/" (epoch ms).
function parseAspNetDate(value: string): Date {
  const match = value.match(/\/Date\((\d+)\)\//);
  return new Date(match ? Number(match[1]) : 0);
}

function toReportFile(raw: RawReportFile): ReportFile {
  return {
    fileInfoID: raw.FileInfoID,
    stockCode: raw.StockCode,
    exchange: raw.CatID,
    companyName: raw.CompanyName.trim(),
    financeUrl: raw.FinanceURL,
    fileUrl: raw.Url,
    title: raw.Title.trim(),
    fullName: raw.FullName.trim(),
    fileExt: raw.FileExt.trim(),
    lastUpdate: parseAspNetDate(raw.LastUpdate),
  };
}

// exchangeID=0 tra ve tat ca san (HoSE/HNX/UPCOM/OTC) trong 1 lan goi.
async function fetchAllReportFiles(session: Session, term: ReportTerm): Promise<ReportFile[]> {
  const files: ReportFile[] = [];
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const raw = await postForm<RawReportFile[]>(session, '/data/getrptfile', {
      documentTypeID: FINANCIAL_STATEMENT_DOC_TYPE_ID,
      reportTermID: term.reportTermID,
      yearPeriod: term.yearPeriod,
      exchangeID: 0,
      orderBy: 2,
      orderDir: 2,
      page,
      pageSize: PAGE_SIZE,
      __RequestVerificationToken: session.requestVerificationToken,
    });

    if (!raw.length) break;
    files.push(...raw.map(toReportFile));

    const totalRow = raw[0]?.TotalRow ?? 0;
    if (files.length >= totalRow) break;
    page += 1;
  }

  return files;
}

// Luu y: bao cao quy trickle in dan trong nhieu tuan sau khi quy ket thuc
// (han nop BCTC quy thuong ~20-30 ngay sau khi quy dong), nen chay lai vao
// cac thoi diem khac nhau trong cung 1 quy se ra so luong bao cao khac nhau -
// day la hanh vi dung, khong phai loi.
export async function fetchQuarterReports(quarter: number, year: number): Promise<ReportFile[]> {
  const session = await getSession();
  const term = await findReportTerm(session, quarter, year);
  if (!term) {
    throw new Error(`vietstock: khong tim thay ky bao cao "Quý ${quarter}" nam ${year}`);
  }
  return fetchAllReportFiles(session, term);
}

// Danh sach TAT CA ky bao cao Vietstock thuc su dang co (goi thang
// /data/getrptterm, KHONG loc theo "Quy N") - dung cho dropdown chon ky tren
// UI (app/FetchControls.tsx), vi Vietstock KHONG chi co Quy 1-4: con co "6T"
// (6 thang dau nam, bao cao soat xet ban nien - ho so RIENG voi Quy 2, cung
// han cuoi ky 30/6), "9T" (9 thang dau nam, cung han cuoi ky 30/9 nhu Quy 3),
// va "Nam" (bao cao kiem toan ca nam, cung han cuoi ky 31/12 nhu Quy 4) - da
// xac nhan qua goi thu that (2026-07-05, xem README). top mac dinh 24 la du
// ~3-4 nam lich su (moi nam co toi da 7 ky: Quy1/Quy2/6T/Quy3/9T/Quy4/Nam).
export async function fetchReportTerms(top = 24): Promise<ReportTerm[]> {
  const session = await getSession();
  const terms = await postForm<RawReportTerm[]>(session, '/data/getrptterm', {
    documentTypeID: FINANCIAL_STATEMENT_DOC_TYPE_ID,
    top,
  });
  return terms.map((term) => ({ yearPeriod: term.YearPeriod, reportTermID: term.ReportTermID, description: term.Description }));
}

// Tra ve dung 1 ReportTerm khop "Quy N nam YYYY" (session rieng, KHONG dung
// chung voi fetchQuarterReports) - dung khi CLI (scripts/run-fetch.ts) truyen
// FETCH_QUARTER/FETCH_YEAR, can quy doi ve ReportTerm truoc khi goi
// runFetchPipeline({term}) (pipeline gio chi lam viec voi ReportTerm, khong
// con nhan quarter/year rieng - xem lib/pipeline.ts).
export async function resolveQuarterTerm(quarter: number, year: number): Promise<ReportTerm | null> {
  const session = await getSession();
  return findReportTerm(session, quarter, year);
}

// Danh sach bao cao THAT cua 1 ky (da co san ReportTerm, vd lay tu
// fetchReportTerms hoac resolveQuarterTerm) - dung cho ca buoc "xem truoc
// danh muc" (app/api/report-list) lan buoc tai that (lib/pipeline.ts).
export async function fetchReportFilesForTerm(term: ReportTerm): Promise<ReportFile[]> {
  const session = await getSession();
  return fetchAllReportFiles(session, term);
}

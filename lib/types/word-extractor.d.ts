// word-extractor khong tu kem .d.ts va khong co goi @types rieng - khai bao
// toi thieu phan API thuc su dung (xem lib/export/doc-statements.ts).
declare module 'word-extractor' {
  export interface WordExtractorDocument {
    getBody(): string;
    getFootnotes(): string;
    getEndnotes(): string;
    getHeaders(options?: { includeFooters?: boolean }): string;
  }

  export default class WordExtractor {
    extract(input: string | Buffer): Promise<WordExtractorDocument>;
  }
}

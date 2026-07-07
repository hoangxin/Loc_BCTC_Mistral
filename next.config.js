/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse (qua pdfjs-dist) bi loi "Object.defineProperty called on
  // non-object" khi Next co gang bundle qua webpack trong cac route handler
  // (app/api/*) - danh dau la package ngoai (require truc tiep luc chay,
  // khong qua webpack) de tranh loi nay. Them ca cac package moi lien quan
  // toi doc file (mammoth/word-extractor dung JSZip/OLE nen ngoai, node-unrar-js
  // can tu doc file .wasm tren dia) vi cung dinh de gap loi tuong tu.
  experimental: {
    // 'tesseract.js' giu trong danh sach du lib/ocr.ts hien khong con noi nao
    // goi (du phong, xem comment dau lib/ocr.ts) - khong anh huong gi neu
    // khong dung toi, tranh phai nho sua lai file nay khi/neu dung lai.
    serverComponentsExternalPackages: [
      'pdf-parse',
      'pdfjs-dist',
      '@napi-rs/canvas',
      'mammoth',
      'word-extractor',
      'adm-zip',
      'node-unrar-js',
      'tesseract.js',
    ],
  },
};

module.exports = nextConfig;

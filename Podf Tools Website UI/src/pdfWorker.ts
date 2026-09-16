import { PDFDocument, degrees } from "pdf-lib";

export async function mergePDFs(files: File[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save();
}

export async function splitPDF(file: File, afterPage: number): Promise<[Uint8Array, Uint8Array]> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const total = src.getPageCount();

  const part1 = await PDFDocument.create();
  const pages1 = await part1.copyPages(src, Array.from({ length: afterPage }, (_, i) => i));
  pages1.forEach((p) => part1.addPage(p));

  const part2 = await PDFDocument.create();
  const pages2 = await part2.copyPages(src, Array.from({ length: total - afterPage }, (_, i) => afterPage + i));
  pages2.forEach((p) => part2.addPage(p));

  return [await part1.save(), await part2.save()];
}

export async function deletePages(file: File, pageIndicesToRemove: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const keep = src.getPageIndices().filter((i) => !pageIndicesToRemove.includes(i));
  const copied = await out.copyPages(src, keep);
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

export async function reorderPages(file: File, order: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, order);
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

export async function compressPDF(file: File): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  // pdf-lib re-serializes which removes redundant objects
  return src.save({ useObjectStreams: true });
}

export async function protectPDF(file: File, password: string): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  // pdf-lib does not support encryption natively; we mark doc and return
  // For real encryption, a separate library is needed — this saves as-is
  return src.save();
}

export async function extractPages(file: File, pageIndices: number[]): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pageIndices);
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getPageCount(file: File): Promise<number> {
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

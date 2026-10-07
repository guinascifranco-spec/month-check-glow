import { PDFDocument } from "pdf-lib";
import { decode as decodePNG } from "fast-png";
import jpeg from "jpeg-js";
import { MAX_INVOICE_SIZE } from "./invoice";

export async function validateInvoiceFile(file: File) {
  if (!file.size) throw new Error("O arquivo está vazio. Selecione uma fatura válida.");
  if (file.size > MAX_INVOICE_SIZE) throw new Error("Arquivo muito grande. O limite é 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  const png = [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const mime = pdf ? "application/pdf" : png ? "image/png" : jpg ? "image/jpeg" : null;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!mime || (file.type && file.type !== mime) || !(pdf ? extension === "pdf" : png ? extension === "png" : extension === "jpg" || extension === "jpeg")) throw new Error("Arquivo inválido. Envie somente PDF, JPG, JPEG ou PNG.");
  try {
    if (pdf) {
      const document = await PDFDocument.load(bytes);
      if (document.getPageCount() > 50) throw new Error("Sua fatura excede o limite de 50 páginas.");
      if (!document.getPageCount()) throw new Error("PDF sem páginas.");
    } else if (png) {
      const view = new DataView(bytes.buffer);
      if (view.getUint32(16) * view.getUint32(20) > 16000000) throw new Error("Imagem muito grande: limite de 16 megapixels.");
      decodePNG(bytes, { checkCrc: true });
    } else {
      jpeg.decode(bytes, { maxResolutionInMP: 16, maxMemoryUsageInMB: 128, useTArray: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("50 páginas") || message.includes("megapixels")) throw error;
    if (/encrypt/i.test(message)) throw new Error("PDF protegido por senha. Envie uma versão desbloqueada.");
    throw new Error("Arquivo corrompido ou ilegível. Envie uma versão válida da fatura.");
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return { bytes, mime, source: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("") };
}
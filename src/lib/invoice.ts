import { z } from "zod";
import { validPersonalPortion } from "./personal-finance";

export const MAX_INVOICE_SIZE = 20 * 1024 * 1024;
export const invoiceSchema = z.object({
  issuer: z.string().nullable(), card: z.string().nullable(), period: z.string().nullable(),
  dueDate: z.string().nullable(), total: z.number().nullable(), currency: z.string().nullable(),
  warnings: z.array(z.string()),
  transactions: z.array(z.object({
    date: z.string().nullable(), description: z.string().nullable(), value: z.number().nullable(),
    type: z.enum(["entrada", "saida"]).nullable(), current: z.number().nullable(), total: z.number().nullable(),
    categoryId: z.string().nullable(), confidence: z.enum(["alta", "media", "baixa"]),
  }).strict()),
}).strict();
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoicePreview = { invoice: Invoice; source: string; categories: { id: string; name: string }[] };
export const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s && Number(s.slice(0,4)) >= 1970 && Number(s.slice(0,4)) <= 3000;
export const reviewedRowSchema = z.object({
  line: z.number().int().min(0).max(499), date: z.string().refine(validDate, "Data inválida"),
  description: z.string().trim().min(1).max(160), value: z.number().finite().min(0).max(999999999).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001),
  type: z.enum(["entrada", "saida"]), categoryId: z.string().uuid().nullable(),
  current: z.number().int().min(1).max(360).nullable(), total: z.number().int().min(1).max(360).nullable(),
  responsibility: z.enum(["own", "shared", "bia", "reimbursable"]),
  personalValue: z.number().finite().min(0).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001),
}).refine(r => (r.current === null && r.total === null) || (r.current !== null && r.total !== null && r.current <= r.total), "Parcelas inválidas")
  .refine(r => validPersonalPortion(r.value, r.responsibility, r.personalValue), "Revise a classificação e minha parte");
export const importSchema = z.object({ source: z.string().regex(/^[a-f0-9]{64}$/), card: z.string().max(24).nullable(), rows: z.array(reviewedRowSchema).min(1).max(500), confirmed: z.boolean(), acknowledgeDuplicates: z.boolean() }).refine(v => new Set(v.rows.map(r => r.line)).size === v.rows.length, "Linhas repetidas");
export type ImportInput = z.infer<typeof importSchema>;
export type Duplicate = { line: number; exact: boolean; description: string; date: string; value: number; reason: string };
export type ImportResult = { imported: number; skipped: number; count: number; duplicates: Duplicate[]; needsReview: boolean };
export function parseMoney(s: string): number | null {
  const cleaned = s.trim().replace(/\s/g, "");
  if (!/^(\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+,\d{1,2})$/.test(cleaned)) return null;
  const value = Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned);
  return Number.isFinite(value) ? value : null;
}
export function invoiceTotals(rows: { value: number | null; type: string | null }[], total: number | null) {
  const known = rows.every(r => r.value !== null && r.type !== null);
  const cents = rows.reduce((sum, r) => sum + Math.round((r.value ?? 0) * 100) * (r.type === "entrada" ? -1 : 1), 0);
  const difference = total === null || !known ? null : Math.round(total * 100) - cents;
  return { identified: cents / 100, difference: difference === null ? null : difference / 100, matches: difference !== null && Math.abs(difference) <= 1, known };
}

import { z } from "zod";

const civilDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function decimalAmountToCents(value: string): bigint | null {
  const match = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = BigInt(match[2]!) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] === "-" ? -cents : cents;
}

export function centsToAmount(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

const amountSchema = z
  .string()
  .trim()
  .refine((value) => {
    const cents = decimalAmountToCents(value);
    return cents !== null && cents > 0n && cents < 100000000000000n;
  }, "Informe um valor positivo com até duas casas decimais");

const dateSchema = z.string().refine(civilDate, "Informe uma data válida");
const optionalDay = z.number().int().min(1).max(31).nullable();

export const creditCardInputSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(80),
  last_four: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  payment_account_id: z.string().uuid().nullable(),
  closing_day: optionalDay,
  due_day: optionalDay,
});

export const invoiceInputSchema = z
  .object({
    card_id: z.string().uuid(),
    period_start: dateSchema,
    period_end: dateSchema,
    closing_date: dateSchema.nullable(),
    due_date: dateSchema.nullable(),
    total_amount: amountSchema,
    source: z.enum(["manual", "imported"]),
  })
  .refine((value) => value.period_start <= value.period_end, {
    message: "O início do período deve ser anterior ao fim",
    path: ["period_end"],
  })
  .refine(
    (value) => !value.due_date || !value.closing_date || value.due_date >= value.closing_date,
    {
      message: "O vencimento não pode ser anterior ao fechamento",
      path: ["due_date"],
    },
  );

export const invoicePaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  account_id: z.string().uuid(),
  effective_date: dateSchema,
  amount: amountSchema,
  idempotency_key: z.string().uuid(),
});

export type CreditCardInput = z.infer<typeof creditCardInputSchema>;
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
export type InvoicePaymentInput = z.infer<typeof invoicePaymentSchema>;

export type InvoiceStatus = "open" | "closed" | "partially_paid" | "paid" | "overdue";

export function getInvoiceStatus(
  input: {
    closed_at: string | null;
    total_amount: string;
    paid_amount: string;
    due_date: string | null;
  },
  asOfDate: string,
): InvoiceStatus {
  const total = decimalAmountToCents(input.total_amount);
  const paid = decimalAmountToCents(input.paid_amount);
  if (total === null || paid === null) throw new Error("Invalid stored invoice amount");
  const remaining = total - paid;
  if (paid > 0n && remaining <= 0n) return "paid";
  if (remaining > 0n && input.due_date && input.due_date < asOfDate) return "overdue";
  if (paid > 0n) return "partially_paid";
  return input.closed_at ? "closed" : "open";
}

export function remainingInvoiceCents(totalAmount: string, paidAmount: string) {
  const total = decimalAmountToCents(totalAmount);
  const paid = decimalAmountToCents(paidAmount);
  if (total === null || paid === null) throw new Error("Invalid stored invoice amount");
  return total - paid;
}

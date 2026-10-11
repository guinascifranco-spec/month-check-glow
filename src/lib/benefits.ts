import { z } from "zod";
import { decimalToCents } from "./financial-movements";

export const isCivilDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const positiveAmount = z
  .string()
  .trim()
  .refine((value) => {
    const cents = decimalToCents(value);
    return cents !== null && cents > 0n && cents < 100000000000000n;
  }, "Informe um valor positivo com até duas casas decimais");

export const benefitEventInputSchema = z.object({
  account_id: z.string().uuid(),
  effective_date: z.string().refine(isCivilDate, "Informe uma data válida"),
  event_type: z.enum(["benefit_credit", "benefit_purchase"]),
  amount: positiveAmount,
  description: z.string().trim().min(1).max(160),
  category_id: z.string().uuid().nullable(),
  month_check_row_id: z.string().uuid().nullable(),
  idempotency_key: z.string().uuid(),
});

export type BenefitEventInput = z.infer<typeof benefitEventInputSchema>;
export type BenefitBudgetRow = {
  id: string;
  transaction_date: string;
  descricao: string;
  valor: string;
};

export function benefitPurchaseMatchesBudgetRow(
  purchase: { effective_date: string; amount: string },
  row: BenefitBudgetRow,
  currencyCode: string,
) {
  if (currencyCode !== "BRL" || purchase.effective_date !== row.transaction_date) return false;
  const purchaseCents = decimalToCents(purchase.amount.replace(",", "."));
  const rowCents = decimalToCents(row.valor);
  return purchaseCents !== null && rowCents !== null && purchaseCents === rowCents;
}

export type BenefitEvent = {
  movement_id: string;
  account_id: string;
  effective_date: string;
  event_type: "benefit_credit" | "benefit_purchase";
  amount: string;
  description: string;
  category_id: string | null;
  category_name: string | null;
  month_check_row_id: string | null;
  budget_description: string | null;
  created_at: string;
};

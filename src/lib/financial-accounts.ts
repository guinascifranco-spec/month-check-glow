import { z } from "zod";

const validCivilDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const financialAccountInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    account_type: z.enum(["bank_account", "wallet", "benefit_wallet", "other"]),
    currency_code: z.string().regex(/^[A-Z]{3}$/),
    opening_balance: z
      .number()
      .finite()
      .min(-999999999999.99)
      .max(999999999999.99)
      .refine(
        (value) => Math.round(value * 100) === value * 100,
        "Use no more than two decimal places",
      )
      .nullable(),
    opening_balance_date: z.string().refine(validCivilDate, "Use a valid date").nullable(),
  })
  .refine((value) => (value.opening_balance === null) === (value.opening_balance_date === null), {
    message: "Opening balance and reference date must be provided together",
  });

export type FinancialAccountInput = z.infer<typeof financialAccountInputSchema>;
export type FinancialAccount = FinancialAccountInput & {
  id: string;
  user_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function openingBalanceLabel(
  account: Pick<FinancialAccount, "opening_balance" | "opening_balance_date">,
) {
  if (account.opening_balance === null || account.opening_balance_date === null) {
    return { known: false as const, amount: null, referenceDate: null };
  }
  return {
    known: true as const,
    amount: Number(account.opening_balance),
    referenceDate: account.opening_balance_date,
  };
}

export function didOpeningBalanceChange(
  before: Pick<FinancialAccount, "opening_balance" | "opening_balance_date">,
  after: Pick<FinancialAccountInput, "opening_balance" | "opening_balance_date">,
) {
  return (
    before.opening_balance !== after.opening_balance ||
    before.opening_balance_date !== after.opening_balance_date
  );
}

export function financialAccountStatusPatch(isActive: boolean) {
  return { is_active: isActive };
}

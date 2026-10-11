import { z } from "zod";

const isCivilDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function decimalToCents(value: string): bigint | null {
  const normalized = value.trim().replace(",", ".");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]!);
  const fraction = BigInt((match[3] ?? "").padEnd(2, "0"));
  return sign * (whole * 100n + fraction);
}

export function centsToDecimal(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

const amountSchema = z
  .string()
  .trim()
  .refine((value) => {
    const cents = decimalToCents(value);
    return cents !== null && cents > 0n && cents < 100000000000000n;
  }, "Informe um valor positivo com até duas casas decimais");

const civilDateSchema = z.string().refine(isCivilDate, "Informe uma data válida");

export const movementInputSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  effective_date: civilDateSchema,
  movement_type: z.enum(["income", "expense"]),
  amount: amountSchema,
  description: z.string().trim().min(1).max(160),
  category_id: z.string().uuid().nullable(),
});

export const transferInputSchema = z
  .object({
    from_account_id: z.string().uuid(),
    to_account_id: z.string().uuid(),
    effective_date: civilDateSchema,
    amount: amountSchema,
    description: z.string().trim().min(1).max(160),
  })
  .refine((value) => value.from_account_id !== value.to_account_id, {
    message: "Escolha duas contas diferentes",
    path: ["to_account_id"],
  });

export const movementRangeSchema = z
  .object({
    from_date: civilDateSchema,
    to_date: civilDateSchema,
    account_id: z.string().uuid().nullable(),
  })
  .refine((value) => value.from_date <= value.to_date, {
    message: "A data inicial deve ser anterior ou igual à data final",
    path: ["to_date"],
  });

export type MovementInput = z.infer<typeof movementInputSchema>;
export type TransferInput = z.infer<typeof transferInputSchema>;

export type BalanceMovement = {
  movement_type: "income" | "expense" | "transfer_in" | "transfer_out";
  effective_date: string;
  amount: string;
  transfer_status: "completed" | "cancelled" | null;
};

export type AccountBalanceSource = {
  opening_balance: string | null;
  opening_balance_date: string | null;
};

export function calculateAccountBalance(
  account: AccountBalanceSource,
  movements: BalanceMovement[],
  asOfDate?: string,
) {
  let netCents = 0n;
  for (const movement of movements) {
    if (movement.transfer_status === "cancelled") continue;
    if (asOfDate && movement.effective_date > asOfDate) continue;
    // The opening amount already includes activity on its reference date.
    if (account.opening_balance_date && movement.effective_date <= account.opening_balance_date)
      continue;
    const cents = decimalToCents(movement.amount);
    if (cents === null) throw new Error("Invalid stored movement amount");
    netCents +=
      movement.movement_type === "expense" || movement.movement_type === "transfer_out"
        ? -cents
        : cents;
  }

  if (
    account.opening_balance === null ||
    account.opening_balance_date === null ||
    (asOfDate !== undefined && account.opening_balance_date > asOfDate)
  ) {
    return {
      known: false as const,
      calculatedBalance: null,
      recordedNetActivity: centsToDecimal(netCents),
    };
  }

  const openingCents = decimalToCents(account.opening_balance);
  if (openingCents === null) throw new Error("Invalid stored opening balance");
  return {
    known: true as const,
    calculatedBalance: centsToDecimal(openingCents + netCents),
    recordedNetActivity: centsToDecimal(netCents),
  };
}

export function transferAccountCompatibility(
  source: { user_id: string; currency_code: string; is_active: boolean },
  target: { user_id: string; currency_code: string; is_active: boolean },
) {
  if (source.user_id !== target.user_id)
    return { ok: false as const, reason: "different_users" as const };
  if (!source.is_active || !target.is_active)
    return { ok: false as const, reason: "inactive_account" as const };
  if (source.currency_code !== target.currency_code)
    return { ok: false as const, reason: "different_currencies" as const };
  return { ok: true as const };
}

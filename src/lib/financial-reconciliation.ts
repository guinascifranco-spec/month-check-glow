export type ReconciliationStatus = "reconciled" | "divergent" | "inconclusive";

export function reconciliationResult(
  reportedBalance: string | number,
  calculatedBalance: string | number | null,
) {
  if (calculatedBalance === null) {
    return { status: "inconclusive" as const, differenceCents: null };
  }
  const reportedCents = decimalToCents(reportedBalance);
  const calculatedCents = decimalToCents(calculatedBalance);
  const differenceCents = reportedCents - calculatedCents;
  return {
    status: (differenceCents === 0n ? "reconciled" : "divergent") as ReconciliationStatus,
    differenceCents,
  };
}

export function decimalToCents(value: string | number): bigint {
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("Valor monetário inválido; use no máximo duas casas decimais.");
  const [, sign, whole, fractional = ""] = match;
  const cents = BigInt(whole) * 100n + BigInt(fractional.padEnd(2, "0"));
  return sign ? -cents : cents;
}

/** A avaliação serve como atual somente se inclui a operação mais recente. */
export function isValuationApplicable(
  valuationDate: string,
  latestOperationDate: string | null,
): boolean {
  return latestOperationDate === null || valuationDate >= latestOperationDate;
}

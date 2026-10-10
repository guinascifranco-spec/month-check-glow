export const RESPONSIBILITIES = {
  own: "100% meu",
  shared: "Dividido com a Bia",
  bia: "100% da Bia",
  reimbursable: "100% reembolsável",
} as const;
export type Responsibility = keyof typeof RESPONSIBILITIES;
export type FinancialRow = {
  tipo: string; valor: number; invoice_source?: string | null;
  invoice_responsibility?: string | null; invoice_personal_value?: number | null;
  invoice_payment?: boolean;
};

/** Integral values stay untouched. Only classified invoice credits offset consumption. */
export function personalContribution(row: FinancialRow) {
  if (row.invoice_payment) return { income: 0, expense: 0, active: false };
  const classified = row.invoice_responsibility != null;
  const amount = Math.round(Number(classified ? row.invoice_personal_value ?? 0 : row.valor) * 100) / 100 || 0;
  if (classified) return { income: 0, expense: row.tipo === "entrada" ? -amount : amount, active: amount !== 0 };
  return { income: row.tipo === "entrada" ? amount : 0, expense: row.tipo === "saida" ? amount : 0, active: amount !== 0 };
}

export function ownPortion(value: number | null, responsibility: Responsibility, shared: number | null): number | null {
  if (value === null) return null;
  if (responsibility === "own") return value;
  if (responsibility !== "shared") return 0;
  return shared !== null && shared >= 0 && shared <= value ? shared : null;
}

export function responsibilityTotals(rows: { value: number | null; type: string | null; responsibility: Responsibility; personalValue: number | null }[]) {
  let personal = 0; let bia = 0; let reimbursable = 0;
  let known = true;
  for (const row of rows) {
    if (row.value === null || row.type === null || row.personalValue === null) { known = false; continue; }
    const sign = row.type === "entrada" ? -1 : 1;
    const full = Math.round(row.value * 100) * sign;
    const own = Math.round(row.personalValue * 100) * sign;
    personal += own;
    if (row.responsibility === "bia" || row.responsibility === "shared") bia += full - own;
    if (row.responsibility === "reimbursable") reimbursable += full;
  }
  return { personal: personal / 100, bia: bia / 100, reimbursable: reimbursable / 100, known };
}
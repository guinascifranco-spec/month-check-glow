/** Reversals cancel recorded contribution cost, not a partial redemption or market value. */
export function reversedInvestmentRecordIds(
  operations: { id: string; aporte_id: string | null; provento_id: string | null }[],
  reversals: { source_operation_id: string }[],
) {
  const reversedOperations = new Set(reversals.map((row) => row.source_operation_id));
  const aporteIds = new Set<string>();
  const proventoIds = new Set<string>();
  for (const operation of operations) {
    if (!reversedOperations.has(operation.id)) continue;
    if (operation.aporte_id) aporteIds.add(operation.aporte_id);
    if (operation.provento_id) proventoIds.add(operation.provento_id);
  }
  return { aporteIds, proventoIds };
}
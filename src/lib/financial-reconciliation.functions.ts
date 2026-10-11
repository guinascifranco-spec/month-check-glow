import { financialSchema } from "./financial-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/);

export const recordAccountReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    account_id: z.string().uuid(), reference_date: isoDate,
    reported_balance: money, note: z.string().max(500).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("record_financial_account_reconciliation", {
      p_account_id: data.account_id, p_reference_date: data.reference_date,
      p_reported_balance_text: data.reported_balance, p_note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const listAccountReconciliations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ account_id: z.string().uuid().nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await financialSchema(context.supabase).rpc("list_financial_account_reconciliations", {
      p_account_id: data.account_id ?? null,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const recordInvestmentValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    asset_id: z.string().uuid(), market_value: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    reference_date: isoDate, note: z.string().max(500).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("record_investment_valuation", {
      p_asset_id: data.asset_id, p_market_value_text: data.market_value,
      p_reference_date: data.reference_date, p_note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const listInvestmentValuations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ asset_id: z.string().uuid().nullable().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await financialSchema(context.supabase).rpc("list_investment_valuations", {
      p_asset_id: data.asset_id ?? null,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const reverseInvestmentCashOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    operation_id: z.string().uuid(), effective_date: isoDate, reason: z.string().trim().min(1).max(500),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("reverse_investment_cash_operation", {
      p_operation_id: data.operation_id, p_effective_date: data.effective_date, p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const listInvestmentOperationReversals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await financialSchema(context.supabase)
      .from("investment_operation_reversals")
      .select("source_operation_id, reason, effective_date")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

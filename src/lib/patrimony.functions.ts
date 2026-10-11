import { financialSchema } from "./financial-schema";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateNetWorthByCurrency } from "./net-worth";

function civilToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export const getKnownNetWorth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = financialSchema(context.supabase);
    const [accountsResult, assetsResult, invoicesResult, balancesResult] = await Promise.all([
      supabase
        .from("financial_accounts")
        .select("id, account_type, currency_code, is_active")
        .eq("user_id", userId),
      supabase
        .from("ativos")
        .select("currency_code, current_value_known, saldo_atual")
        .eq("user_id", userId),
      supabase.rpc("list_credit_card_invoices"),
      supabase.rpc("financial_account_balances", { p_as_of_date: civilToday() }),
    ]);
    for (const result of [accountsResult, assetsResult, invoicesResult, balancesResult]) {
      if (result.error) throw new Error(result.error.message);
    }
    const balances = new Map(
      (balancesResult.data ?? []).map((row) => [row.account_id, row.calculated_balance]),
    );
    const accounts = (accountsResult.data ?? []).map((account) => ({
      accountType: account.account_type,
      currencyCode: account.currency_code,
      isActive: account.is_active,
      calculatedBalance: balances.get(account.id) ?? null,
    }));
    const assets = (assetsResult.data ?? []).map((asset) => ({
      currencyCode: asset.currency_code,
      currentValueKnown: asset.current_value_known,
      currentValue: asset.saldo_atual,
    }));
    const invoices = (invoicesResult.data ?? []).map((invoice) => ({
      currencyCode: invoice.currency_code,
      remainingAmount: invoice.remaining_amount,
    }));
    return calculateNetWorthByCurrency({ accounts, assets, invoices }).map((row) => ({
      ...row,
      bankCashCents: row.bankCashCents.toString(),
      investmentValueCents: row.investmentValueCents.toString(),
      benefitBalanceCents: row.benefitBalanceCents.toString(),
      invoiceLiabilitiesCents: row.invoiceLiabilitiesCents.toString(),
      netWorthCents: row.netWorthCents.toString(),
    }));
  });

export const getIntegratedFinancialSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = financialSchema(context.supabase);
    const asOfDate = civilToday();
    const [accountsResult, balancesResult, invoicesResult] = await Promise.all([
      supabase.from("financial_accounts").select("id, name, account_type, currency_code, is_active, opening_balance_date").eq("user_id", userId).eq("is_active", true),
      supabase.rpc("financial_account_balances", { p_as_of_date: asOfDate }),
      supabase.rpc("list_credit_card_invoices"),
    ]);
    for (const result of [accountsResult, balancesResult, invoicesResult]) if (result.error) throw new Error(result.error.message);
    const balances = new Map((balancesResult.data ?? []).map((row) => [row.account_id, row]));
    const accounts = (accountsResult.data ?? []).map((account) => ({
      id: account.id, name: account.name, accountType: account.account_type,
      currencyCode: account.currency_code, openingBalanceDate: account.opening_balance_date,
      calculatedBalance: balances.get(account.id)?.calculated_balance ?? null,
      recordedActivity: balances.get(account.id)?.recorded_net_activity ?? "0.00",
    }));
    const invoices = (invoicesResult.data ?? []).filter((invoice) => Number(invoice.remaining_amount) > 0).map((invoice) => ({
      id: invoice.id, cardName: invoice.card_name, currencyCode: invoice.currency_code,
      totalAmount: invoice.total_amount, paidAmount: invoice.paid_amount,
      remainingAmount: invoice.remaining_amount, dueDate: invoice.due_date,
      periodStart: invoice.period_start, periodEnd: invoice.period_end,
      status: invoice.due_date && invoice.due_date < asOfDate ? "vencida" : (Number(invoice.paid_amount) > 0 ? "parcial" : invoice.closed_at ? "fechada" : "aberta"),
    }));
    return { asOfDate, accounts, invoices };
  });

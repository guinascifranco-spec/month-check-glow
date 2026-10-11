import { financialSchema } from "./financial-schema";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Exporta todas as tabelas do usuário como JSON para download.
 * SOMENTE LEITURA — não altera nenhum dado.
 *
 * Retorna um objeto com cada tabela como chave e seus registros como array.
 * O chamador deve oferecer o download via Blob/URL.
 */
export const exportBackup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const supabase = financialSchema(context.supabase);

    const [
      monthCheckRows,
      checklistItems,
      investments,
      installmentSettings,
      installments,
      expenseCategories,
      categoryRules,
      financialAccounts,
      financialMovements,
      financialTransfers,
      creditCards,
      creditCardInvoices,
      creditCardPayments,
      creditCardInvoiceItems,
      benefitWalletEvents,
      ativos,
      aportes,
      proventos,
      investmentCashOperations,
      accountReconciliations,
      investmentValuations,
      investmentOperationReversals,
      financialTransferCancellations,
    ] = await Promise.all([
      // month_check_rows — tabela de Lançamentos (e dados históricos da Conferência)
      supabase
        .from("month_check_rows")
        .select("*")
        .eq("user_id", userId)
        .order("year", { ascending: true })
        .order("month", { ascending: true })
        .order("position", { ascending: true }),

      // checklist_items — tabela nova da Conferência (pode estar vazia antes da migração)
      supabase
        .from("checklist_items")
        .select("*")
        .eq("user_id", userId)
        .order("year", { ascending: true })
        .order("month", { ascending: true })
        .order("position", { ascending: true }),

      // investments — tabela simples legada
      supabase
        .from("investments")
        .select("*")
        .eq("user_id", userId)
        .order("position", { ascending: true }),

      // installment_settings
      supabase
        .from("installment_settings")
        .select("*")
        .eq("user_id", userId),

      // installments
      supabase
        .from("installments")
        .select("*")
        .eq("user_id", userId)
        .order("first_date", { ascending: true }),

      // expense_categories
      supabase
        .from("expense_categories")
        .select("*")
        .eq("user_id", userId)
        .order("name", { ascending: true }),

      // category_rules (nova — pode estar vazia)
      supabase
        .from("category_rules")
        .select("*")
        .eq("user_id", userId),

      // financial_accounts — contas e saldos iniciais informados
      supabase
        .from("financial_accounts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),

      // financial_movements and financial_transfers — independent cash ledger
      supabase
        .from("financial_movements")
        .select("*")
        .eq("user_id", userId)
        .order("effective_date", { ascending: true }),
      supabase
        .from("financial_transfers")
        .select("*")
        .eq("user_id", userId)
        .order("effective_date", { ascending: true }),

      supabase.from("credit_cards").select("*").eq("user_id", userId).order("name"),
      supabase
        .from("credit_card_invoices")
        .select("*")
        .eq("user_id", userId)
        .order("period_start", { ascending: true }),
      supabase
        .from("credit_card_payments")
        .select("*")
        .eq("user_id", userId)
        .order("effective_date", { ascending: true }),
      supabase
        .from("credit_card_invoice_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),

      // benefit_wallet_events — semântica VA e vínculo explícito ao orçamento
      supabase
        .from("benefit_wallet_events")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),

      // ativos
      supabase
        .from("ativos")
        .select("*")
        .eq("user_id", userId)
        .order("tipo", { ascending: true })
        .order("nome", { ascending: true }),

      // aportes
      supabase
        .from("aportes")
        .select("*")
        .eq("user_id", userId)
        .order("data", { ascending: true }),

      // proventos
      supabase
        .from("proventos")
        .select("*")
        .eq("user_id", userId)
        .order("data_recebimento", { ascending: true }),
      supabase
        .from("investment_cash_operations")
        .select("*")
        .eq("user_id", userId)
        .order("effective_date", { ascending: true }),
      supabase.from("financial_account_reconciliations").select("*").eq("user_id", userId).order("reference_date", { ascending: true }),
      supabase.from("investment_valuations").select("*").eq("user_id", userId).order("reference_date", { ascending: true }),
      supabase.from("investment_operation_reversals").select("*").eq("user_id", userId).order("effective_date", { ascending: true }),
      supabase.from("financial_transfer_cancellations").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    ]);

    // Verificar erros
    const errors = [
      monthCheckRows.error,
      checklistItems.error,
      investments.error,
      installmentSettings.error,
      installments.error,
      expenseCategories.error,
      categoryRules.error,
      financialAccounts.error,
      financialMovements.error,
      financialTransfers.error,
      creditCards.error,
      creditCardInvoices.error,
      creditCardPayments.error,
      creditCardInvoiceItems.error,
      benefitWalletEvents.error,
      ativos.error,
      aportes.error,
      proventos.error,
      investmentCashOperations.error,
      accountReconciliations.error,
      investmentValuations.error,
      investmentOperationReversals.error,
      financialTransferCancellations.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(`Erro ao exportar backup: ${errors.map((e) => e?.message).join("; ")}`);
    }

    const exportedAt = new Date().toISOString();

    return {
      exportedAt,
      userId,
      counts: {
        month_check_rows: monthCheckRows.data?.length ?? 0,
        checklist_items: checklistItems.data?.length ?? 0,
        investments: investments.data?.length ?? 0,
        installment_settings: installmentSettings.data?.length ?? 0,
        installments: installments.data?.length ?? 0,
        expense_categories: expenseCategories.data?.length ?? 0,
        category_rules: categoryRules.data?.length ?? 0,
        financial_accounts: financialAccounts.data?.length ?? 0,
        financial_movements: financialMovements.data?.length ?? 0,
        financial_transfers: financialTransfers.data?.length ?? 0,
        credit_cards: creditCards.data?.length ?? 0,
        credit_card_invoices: creditCardInvoices.data?.length ?? 0,
        credit_card_payments: creditCardPayments.data?.length ?? 0,
        credit_card_invoice_items: creditCardInvoiceItems.data?.length ?? 0,
        benefit_wallet_events: benefitWalletEvents.data?.length ?? 0,
        ativos: ativos.data?.length ?? 0,
        aportes: aportes.data?.length ?? 0,
        proventos: proventos.data?.length ?? 0,
        investment_cash_operations: investmentCashOperations.data?.length ?? 0,
        financial_account_reconciliations: accountReconciliations.data?.length ?? 0,
        investment_valuations: investmentValuations.data?.length ?? 0,
        investment_operation_reversals: investmentOperationReversals.data?.length ?? 0,
        financial_transfer_cancellations: financialTransferCancellations.data?.length ?? 0,
      },
      tables: {
        month_check_rows: monthCheckRows.data ?? [],
        checklist_items: checklistItems.data ?? [],
        investments: investments.data ?? [],
        installment_settings: installmentSettings.data ?? [],
        installments: installments.data ?? [],
        expense_categories: expenseCategories.data ?? [],
        category_rules: categoryRules.data ?? [],
        financial_accounts: financialAccounts.data ?? [],
        financial_movements: financialMovements.data ?? [],
        financial_transfers: financialTransfers.data ?? [],
        credit_cards: creditCards.data ?? [],
        credit_card_invoices: creditCardInvoices.data ?? [],
        credit_card_payments: creditCardPayments.data ?? [],
        credit_card_invoice_items: creditCardInvoiceItems.data ?? [],
        benefit_wallet_events: benefitWalletEvents.data ?? [],
        ativos: ativos.data ?? [],
        aportes: aportes.data ?? [],
        proventos: proventos.data ?? [],
        investment_cash_operations: investmentCashOperations.data ?? [],
        financial_account_reconciliations: accountReconciliations.data ?? [],
        investment_valuations: investmentValuations.data ?? [],
        investment_operation_reversals: investmentOperationReversals.data ?? [],
        financial_transfer_cancellations: financialTransferCancellations.data ?? [],
      },
    };
  });

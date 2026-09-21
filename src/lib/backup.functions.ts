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
    const { supabase, userId } = context;

    const [
      monthCheckRows,
      checklistItems,
      investments,
      installmentSettings,
      installments,
      expenseCategories,
      categoryRules,
      ativos,
      aportes,
      proventos,
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
      ativos.error,
      aportes.error,
      proventos.error,
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
        ativos: ativos.data?.length ?? 0,
        aportes: aportes.data?.length ?? 0,
        proventos: proventos.data?.length ?? 0,
      },
      tables: {
        month_check_rows: monthCheckRows.data ?? [],
        checklist_items: checklistItems.data ?? [],
        investments: investments.data ?? [],
        installment_settings: installmentSettings.data ?? [],
        installments: installments.data ?? [],
        expense_categories: expenseCategories.data ?? [],
        category_rules: categoryRules.data ?? [],
        ativos: ativos.data ?? [],
        aportes: aportes.data ?? [],
        proventos: proventos.data ?? [],
      },
    };
  });

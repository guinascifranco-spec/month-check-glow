import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_TEMPLATE: Array<{ descricao: string; tipo: "entrada" | "saida" }> = [
  { descricao: "Salário", tipo: "entrada" },
  { descricao: "Adiantamento", tipo: "entrada" },
  { descricao: "Acertos Bia", tipo: "entrada" },
  { descricao: "Demais entradas", tipo: "entrada" },
  { descricao: "Fatura NBK", tipo: "saida" },
  { descricao: "Aluguel", tipo: "saida" },
  { descricao: "Condomínio", tipo: "saida" },
  { descricao: "Energia", tipo: "saida" },
  { descricao: "Internet e Celular", tipo: "saida" },
  { descricao: "Água", tipo: "saida" },
  { descricao: "Gás", tipo: "saida" },
  { descricao: "Lavanderia", tipo: "saida" },
  { descricao: "Psicólogo", tipo: "saida" },
];

const FIXED_DEFAULTS = new Set([
  "Aluguel", "Condomínio", "Energia", "Internet e Celular", "Água", "Gás", "Lavanderia", "Psicólogo",
]);

const periodSchema = z.object({
  year: z.number().int().min(1970).max(3000),
  month: z.number().int().min(1).max(12),
});

export const getMonthRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month: number }) => periodSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Check existing
    const { data: existing, error: selErr } = await supabase
      .from("month_check_rows")
      .select("*")
      .eq("user_id", userId)
      .eq("year", data.year)
      .eq("month", data.month)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (selErr) throw new Error(selErr.message);

    if (existing && existing.length > 0) return existing;

    // Seed template
    const rows = DEFAULT_TEMPLATE.map((t, i) => ({
      user_id: userId,
      year: data.year,
      month: data.month,
      descricao: t.descricao,
      tipo: t.tipo,
      valor: 0,
      position: i,
      expense_class: t.tipo === "saida" && FIXED_DEFAULTS.has(t.descricao) ? "fixo" : "variavel",
    }));
    const { data: inserted, error: insErr } = await supabase
      .from("month_check_rows")
      .insert(rows)
      .select("*")
      .order("position", { ascending: true });
    if (insErr) throw new Error(insErr.message);
    return inserted ?? [];
  });

export const addRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month: number; tipo: "entrada" | "saida" }) =>
    z.object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      tipo: z.enum(["entrada", "saida"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: maxRow } = await supabase
      .from("month_check_rows")
      .select("position")
      .eq("user_id", userId)
      .eq("year", data.year)
      .eq("month", data.month)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position ?? -1) + 1;
    const { data: row, error } = await supabase
      .from("month_check_rows")
      .insert({
        user_id: userId,
        year: data.year,
        month: data.month,
        tipo: data.tipo,
        descricao: "",
        valor: 0,
        position: nextPos,
        expense_class: "variavel",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    descricao?: string;
    tipo?: "entrada" | "saida";
    valor?: number;
    quitado?: boolean;
    expense_class?: "fixo" | "variavel";
  }) =>
    z.object({
      id: z.string().uuid(),
      descricao: z.string().optional(),
      tipo: z.enum(["entrada", "saida"]).optional(),
      valor: z.number().optional(),
      quitado: z.boolean().optional(),
      expense_class: z.enum(["fixo", "variavel"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { descricao?: string; tipo?: "entrada" | "saida"; valor?: number; quitado?: boolean; expense_class?: "fixo" | "variavel" } = {};
    if (data.descricao !== undefined) patch.descricao = data.descricao;
    if (data.tipo !== undefined) patch.tipo = data.tipo;
    if (data.valor !== undefined) patch.valor = data.valor;
    if (data.quitado !== undefined) patch.quitado = data.quitado;
    if (data.expense_class !== undefined) patch.expense_class = data.expense_class;
    const { data: row, error } = await supabase
      .from("month_check_rows")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const reorderRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderedIds: string[] }) =>
    z.object({ orderedIds: z.array(z.string().uuid()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await Promise.all(
      data.orderedIds.map((id, idx) =>
        supabase
          .from("month_check_rows")
          .update({ position: idx })
          .eq("id", id)
          .eq("user_id", userId),
      ),
    );
    return { ok: true };
  });

export const deleteRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("month_check_rows")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getYearTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number }) =>
    z.object({ year: z.number().int().min(1970).max(3000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("month_check_rows")
      .select("month, tipo, valor")
      .eq("user_id", userId)
      .eq("year", data.year);
    if (error) throw new Error(error.message);

    const totals = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      entradas: 0,
      saidas: 0,
    }));
    for (const r of rows ?? []) {
      const idx = (r.month as number) - 1;
      if (idx < 0 || idx > 11) continue;
      const v = Number(r.valor) || 0;
      if (r.tipo === "entrada") totals[idx].entradas += v;
      else totals[idx].saidas += v;
    }
    return totals;
  });


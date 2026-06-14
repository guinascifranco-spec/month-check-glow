import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_TEMPLATE: Array<{ descricao: string; tipo: "entrada" | "saida" }> = [
  { descricao: "Salário", tipo: "entrada" },
  { descricao: "Adiantamento", tipo: "entrada" },
  { descricao: "Bolsa Pais", tipo: "entrada" },
  { descricao: "Mensal Sergio", tipo: "entrada" },
  { descricao: "Mensal Lucia", tipo: "entrada" },
  { descricao: "Reembolso família", tipo: "entrada" },
  { descricao: "A receber", tipo: "entrada" },
  { descricao: "Fatura NBK", tipo: "saida" },
  { descricao: "Fatura C6", tipo: "saida" },
  { descricao: "Aluguel", tipo: "saida" },
  { descricao: "Condomínio", tipo: "saida" },
  { descricao: "Energia", tipo: "saida" },
  { descricao: "Internet", tipo: "saida" },
  { descricao: "Água/Gás", tipo: "saida" },
];

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
  }) =>
    z.object({
      id: z.string().uuid(),
      descricao: z.string().optional(),
      tipo: z.enum(["entrada", "saida"]).optional(),
      valor: z.number().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { descricao?: string; tipo?: "entrada" | "saida"; valor?: number } = {};
    if (data.descricao !== undefined) patch.descricao = data.descricao;
    if (data.tipo !== undefined) patch.tipo = data.tipo;
    if (data.valor !== undefined) patch.valor = data.valor;
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

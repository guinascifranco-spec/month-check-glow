import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ASSET_TYPES = ["acao", "fii", "renda_fixa", "cripto"] as const;
const PROVENTO_TYPES = ["dividendo", "jcp", "rendimento", "cupom"] as const;

// ----- Ativos -----
export const listAtivos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("ativos")
      .select("*")
      .eq("user_id", userId)
      .order("tipo", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tipo: string; nome: string; corretora?: string | null }) =>
    z
      .object({
        tipo: z.enum(ASSET_TYPES),
        nome: z.string().trim().min(1).max(120),
        corretora: z.string().trim().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("ativos")
      .insert({
        user_id: userId,
        tipo: data.tipo,
        nome: data.nome,
        corretora: data.corretora || null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAtivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("ativos")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- Aportes -----
const aporteInput = z.object({
  ativo_id: z.string().uuid(),
  data: z.string().min(1),
  quantidade: z.number().nonnegative(),
  valor_unitario: z.number().nonnegative(),
  taxas: z.number().nonnegative().optional(),
  is_retroativo: z.boolean().optional(),
  provento_id: z.string().uuid().optional(),
});

export const listAportes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("aportes")
      .select("*")
      .eq("user_id", userId)
      .order("data", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof aporteInput>) => aporteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const taxas = data.taxas ?? 0;
    const valor_total = data.quantidade * data.valor_unitario + taxas;
    const { data: aporte, error } = await supabase
      .from("aportes")
      .insert({
        user_id: userId,
        ativo_id: data.ativo_id,
        data: data.data,
        quantidade: data.quantidade,
        valor_unitario: data.valor_unitario,
        valor_total,
        taxas,
        is_retroativo: data.is_retroativo ?? false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.provento_id) {
      const { error: updErr } = await supabase
        .from("proventos")
        .update({ status: "reinvestido", aporte_reinvestimento_id: aporte.id })
        .eq("id", data.provento_id)
        .eq("user_id", userId);
      if (updErr) {
        await supabase.from("aportes").delete().eq("id", aporte.id).eq("user_id", userId);
        throw new Error(updErr.message);
      }
    }
    return aporte;
  });

export const bulkCreateAportesRetroativos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    ativo_id: string;
    linhas: { data: string; quantidade: number; valor_unitario: number; taxas?: number }[];
  }) =>
    z
      .object({
        ativo_id: z.string().uuid(),
        linhas: z
          .array(
            z.object({
              data: z.string().min(1),
              quantidade: z.number().nonnegative(),
              valor_unitario: z.number().nonnegative(),
              taxas: z.number().nonnegative().optional(),
            }),
          )
          .min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = data.linhas.map((l) => {
      const taxas = l.taxas ?? 0;
      return {
        user_id: userId,
        ativo_id: data.ativo_id,
        data: l.data,
        quantidade: l.quantidade,
        valor_unitario: l.valor_unitario,
        valor_total: l.quantidade * l.valor_unitario + taxas,
        taxas,
        is_retroativo: true,
      };
    });
    const { error } = await supabase.from("aportes").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

export const deleteAporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // reverte proventos vinculados
    await supabase
      .from("proventos")
      .update({ status: "a_reinvestir", aporte_reinvestimento_id: null })
      .eq("aporte_reinvestimento_id", data.id)
      .eq("user_id", userId);
    const { error } = await supabase
      .from("aportes")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- Proventos -----
export const listProventos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("proventos")
      .select("*")
      .eq("user_id", userId)
      .order("data_recebimento", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createProvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    ativo_id: string;
    tipo: string;
    data_recebimento: string;
    valor: number;
  }) =>
    z
      .object({
        ativo_id: z.string().uuid(),
        tipo: z.enum(PROVENTO_TYPES),
        data_recebimento: z.string().min(1),
        valor: z.number().nonnegative(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("proventos")
      .insert({
        user_id: userId,
        ativo_id: data.ativo_id,
        tipo: data.tipo,
        data_recebimento: data.data_recebimento,
        valor: data.valor,
        status: "a_reinvestir",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteProvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("proventos")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

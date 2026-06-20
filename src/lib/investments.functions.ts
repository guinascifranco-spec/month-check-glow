import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listInvestments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addInvestment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: maxRow } = await supabase
      .from("investments")
      .select("position")
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position ?? -1) + 1;
    const { data, error } = await supabase
      .from("investments")
      .insert({
        user_id: userId,
        category: "",
        balance: 0,
        monthly_return_pct: 0,
        position: nextPos,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateInvestment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    category?: string;
    balance?: number;
    monthly_return_pct?: number;
  }) =>
    z.object({
      id: z.string().uuid(),
      category: z.string().optional(),
      balance: z.number().optional(),
      monthly_return_pct: z.number().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    if (data.category !== undefined) patch.category = data.category;
    if (data.balance !== undefined) patch.balance = data.balance;
    if (data.monthly_return_pct !== undefined) patch.monthly_return_pct = data.monthly_return_pct;
    const { data: row, error } = await supabase
      .from("investments")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteInvestment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("investments")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAllMonthlyTotals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("month_check_rows")
      .select("year, month, tipo, valor")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    const map = new Map<string, { year: number; month: number; entradas: number; saidas: number }>();
    for (const r of data ?? []) {
      const v = Number(r.valor) || 0;
      if (v === 0) continue;
      const key = `${r.year}-${r.month}`;
      let cur = map.get(key);
      if (!cur) {
        cur = { year: r.year as number, month: r.month as number, entradas: 0, saidas: 0 };
        map.set(key, cur);
      }
      if (r.tipo === "entrada") cur.entradas += v;
      else cur.saidas += v;
    }
    const arr = Array.from(map.values())
      .map((m) => ({ ...m, saldo: m.entradas - m.saidas }))
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));
    return arr;
  });

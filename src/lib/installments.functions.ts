import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("installment_settings")
      .select("monthly_limit")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { monthly_limit: Number(data?.monthly_limit ?? 0) };
  });

export const upsertLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { monthly_limit: number }) =>
    z.object({ monthly_limit: z.number().min(0) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("installment_settings")
      .upsert(
        { user_id: userId, monthly_limit: data.monthly_limit },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listInstallments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("installments")
      .select("*")
      .eq("user_id", userId)
      .order("first_date", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string;
    first_date: string;
    installment_value: number;
    total_installments: number;
  }) =>
    z.object({
      name: z.string().min(1).max(120),
      first_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      installment_value: z.number().min(0),
      total_installments: z.number().int().min(1).max(360),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("installments")
      .insert({
        user_id: userId,
        name: data.name,
        first_date: data.first_date,
        installment_value: data.installment_value,
        total_installments: data.total_installments,
        position: 0,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("installments")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

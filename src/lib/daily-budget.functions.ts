import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cycleMonth } from "./daily-budget";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Raw inputs for the calendar; all calculation happens in daily-budget.ts. */
export const getCalendarData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cycleStart: string; cycleEnd: string }) =>
    z.object({ cycleStart: dateSchema, cycleEnd: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { year, month } = cycleMonth(data.cycleStart);
    const [plan, inst, rows, prefs] = await Promise.all([
      supabase.from("checklist_items").select("tipo, expense_class, valor").eq("user_id", userId).eq("year", year).eq("month", month),
      supabase.from("installments").select("first_date, installment_value, total_installments").eq("user_id", userId),
      supabase
        .from("month_check_rows")
        .select("id, descricao, transaction_date, tipo, valor, expense_class, invoice_source, invoice_responsibility, invoice_personal_value, invoice_payment, invoice_installment_total")
        .eq("user_id", userId)
        .gte("transaction_date", data.cycleStart)
        .lt("transaction_date", data.cycleEnd)
        .order("transaction_date"),
      supabase.from("calendar_preferences").select("reserved_amount").eq("user_id", userId).maybeSingle(),
    ]);
    for (const r of [plan, inst, rows, prefs]) if (r.error) throw new Error(r.error.message);
    return {
      planItems: (plan.data ?? []).map((i) => ({ ...i, valor: Number(i.valor) })),
      installments: (inst.data ?? []).map((i) => ({ ...i, installment_value: Number(i.installment_value) })),
      rows: (rows.data ?? []).map((r) => ({
        ...r,
        valor: Number(r.valor),
        invoice_personal_value: r.invoice_personal_value == null ? null : Number(r.invoice_personal_value),
      })),
      reserved: Number(prefs.data?.reserved_amount ?? 0),
    };
  });

export const saveReservedAmount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amount: number }) => z.object({ amount: z.number().min(0).max(1e9) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_preferences")
      .upsert({ user_id: context.userId, reserved_amount: data.amount, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

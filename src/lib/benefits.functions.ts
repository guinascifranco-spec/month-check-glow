import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { benefitEventInputSchema, isCivilDate } from "./benefits";

const civilDate = z.string().refine(isCivilDate, "Informe uma data válida");

export const recordBenefitWalletEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => benefitEventInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("record_benefit_wallet_event", {
      p_account_id: data.account_id,
      p_effective_date: data.effective_date,
      p_event_type: data.event_type,
      p_amount_text: data.amount.trim().replace(",", "."),
      p_description: data.description,
      p_category_id: data.category_id,
      p_month_check_row_id: data.month_check_row_id,
      p_idempotency_key: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const listBenefitWalletEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        from_date: civilDate,
        to_date: civilDate,
        account_id: z.string().uuid().nullable(),
      })
      .refine((value) => value.from_date <= value.to_date)
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("list_benefit_wallet_events", {
      p_from_date: data.from_date,
      p_to_date: data.to_date,
      p_account_id: data.account_id,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listUnlinkedBenefitBudgetRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_unlinked_benefit_budget_rows");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const unlinkBenefitBudgetRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ movement_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("unlink_benefit_budget_row", {
      p_movement_id: data.movement_id,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

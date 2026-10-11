import { financialSchema } from "./financial-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  movementInputSchema,
  movementRangeSchema,
  transferInputSchema,
} from "./financial-movements";

export const getFinancialAccountBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { data, error } = await financialSchema(context.supabase).rpc("financial_account_balances", {
      p_as_of_date: input.as_of_date,
    });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listFinancialMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => movementRangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await financialSchema(context.supabase).rpc("list_financial_movements", {
      p_from_date: data.from_date,
      p_to_date: data.to_date,
      p_account_id: data.account_id,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listFinancialMovementCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await financialSchema(context.supabase).rpc("list_financial_movement_categories");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createFinancialMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => movementInputSchema.omit({ id: true }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("create_financial_movement", {
      p_account_id: data.account_id,
      p_effective_date: data.effective_date,
      p_movement_type: data.movement_type,
      p_amount_text: data.amount.trim().replace(",", "."),
      p_description: data.description,
      p_category_id: data.category_id,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const updateFinancialMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => movementInputSchema.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("update_financial_movement", {
      p_id: data.id,
      p_account_id: data.account_id,
      p_effective_date: data.effective_date,
      p_movement_type: data.movement_type,
      p_amount_text: data.amount.trim().replace(",", "."),
      p_description: data.description,
      p_category_id: data.category_id,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const deleteFinancialMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await financialSchema(context.supabase).rpc("delete_financial_movement", { p_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createFinancialTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => transferInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("create_financial_transfer", {
      p_from_account_id: data.from_account_id,
      p_to_account_id: data.to_account_id,
      p_effective_date: data.effective_date,
      p_amount_text: data.amount.trim().replace(",", "."),
      p_description: data.description,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const cancelFinancialTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ transfer_id: z.string().uuid(), reason: z.string().trim().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("cancel_financial_transfer_with_reason", {
      p_transfer_id: data.transfer_id, p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const listFinancialTransferCancellations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await financialSchema(context.supabase)
      .from("financial_transfer_cancellations")
      .select("transfer_id, reason, created_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

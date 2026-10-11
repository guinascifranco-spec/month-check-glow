import { financialSchema } from "./financial-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { financialAccountInputSchema, financialAccountStatusPatch } from "./financial-accounts";

export const listFinancialAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await financialSchema(context.supabase)
      .from("financial_accounts")
      .select("*")
      .eq("user_id", context.userId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createFinancialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => financialAccountInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await financialSchema(context.supabase)
      .from("financial_accounts")
      .insert({ ...data, user_id: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateFinancialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        changes: financialAccountInputSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await financialSchema(context.supabase)
      .from("financial_accounts")
      .update({ ...data.changes, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setFinancialAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await financialSchema(context.supabase)
      .from("financial_accounts")
      .update({
        ...financialAccountStatusPatch(data.is_active),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

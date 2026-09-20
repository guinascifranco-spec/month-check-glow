import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEFAULT_CATEGORIES = [
  ["Moradia", "emerald"],
  ["Alimentação", "cyan"],
  ["Transporte", "amber"],
  ["Saúde", "red"],
  ["Lazer", "violet"],
  ["Assinaturas", "blue"],
  ["Educação", "pink"],
  ["Outros", "gray"],
] as const;

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getTransactionWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string }) =>
    z.object({ from: dateSchema, to: dateSchema }).refine((value) => value.from <= value.to).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let { data: categories, error: categoryError } = await supabase
      .from("expense_categories")
      .select("id, name, color_key")
      .eq("user_id", userId)
      .order("name");
    if (categoryError) throw new Error(categoryError.message);

    if (!categories?.length) {
      const seeded = DEFAULT_CATEGORIES.map(([name, color_key]) => ({ user_id: userId, name, color_key }));
      const result = await supabase.from("expense_categories").insert(seeded).select("id, name, color_key").order("name");
      if (result.error) throw new Error(result.error.message);
      categories = result.data;
    }

    const fromDate = new Date(`${data.from}T12:00:00Z`);
    const toDate = new Date(`${data.to}T12:00:00Z`);
    const fromYear = fromDate.getUTCFullYear();
    const fromMonth = fromDate.getUTCMonth() + 1;
    const toYear = toDate.getUTCFullYear();
    const toMonth = toDate.getUTCMonth() + 1;
    const { data: rows, error: rowError } = await supabase
      .from("month_check_rows")
      .select("id, year, month, transaction_date, descricao, tipo, valor, quitado, expense_class, category_id, position")
      .eq("user_id", userId)
      .or(`and(year.eq.${fromYear},month.gte.${fromMonth}),and(year.gt.${fromYear},year.lt.${toYear}),and(year.eq.${toYear},month.lte.${toMonth})`)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .order("position", { ascending: true });
    if (rowError) throw new Error(rowError.message);

    const filtered = (rows ?? []).filter((row) => {
      const effectiveDate = row.transaction_date ?? `${row.year}-${String(row.month).padStart(2, "0")}-01`;
      return effectiveDate >= data.from && effectiveDate <= data.to;
    });
    return { categories: categories ?? [], rows: filtered };
  });

export const createTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { date: string; description: string; type: "entrada" | "saida"; value: number; categoryId?: string | null; expenseClass: "fixo" | "variavel"; settled: boolean }) =>
    z.object({
      date: dateSchema,
      description: z.string().trim().min(1).max(160),
      type: z.enum(["entrada", "saida"]),
      value: z.number().finite().nonnegative(),
      categoryId: idSchema.nullish(),
      expenseClass: z.enum(["fixo", "variavel"]),
      settled: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [year, month] = data.date.split("-").map(Number);
    const { data: last } = await context.supabase
      .from("month_check_rows").select("position")
      .eq("user_id", context.userId).eq("year", year).eq("month", month)
      .order("position", { ascending: false }).limit(1).maybeSingle();
    const { data: row, error } = await context.supabase.from("month_check_rows").insert({
      user_id: context.userId,
      year,
      month,
      transaction_date: data.date,
      descricao: data.description,
      tipo: data.type,
      valor: data.value,
      category_id: data.type === "saida" ? (data.categoryId ?? null) : null,
      expense_class: data.type === "saida" ? data.expenseClass : "variavel",
      quitado: data.settled,
      position: (last?.position ?? -1) + 1,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; date: string; description: string; type: "entrada" | "saida"; value: number; categoryId?: string | null; expenseClass: "fixo" | "variavel"; settled: boolean }) =>
    z.object({
      id: idSchema,
      date: dateSchema,
      description: z.string().trim().min(1).max(160),
      type: z.enum(["entrada", "saida"]),
      value: z.number().finite().nonnegative(),
      categoryId: idSchema.nullish(),
      expenseClass: z.enum(["fixo", "variavel"]),
      settled: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [year, month] = data.date.split("-").map(Number);
    const { error } = await context.supabase.from("month_check_rows").update({
      year,
      month,
      transaction_date: data.date,
      descricao: data.description,
      tipo: data.type,
      valor: data.value,
      category_id: data.type === "saida" ? (data.categoryId ?? null) : null,
      expense_class: data.type === "saida" ? data.expenseClass : "variavel",
      quitado: data.settled,
    }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("month_check_rows").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createExpenseCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; colorKey: string }) => z.object({ name: z.string().trim().min(1).max(50), colorKey: z.string().min(1).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expense_categories").insert({ user_id: context.userId, name: data.name, color_key: data.colorKey });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameExpenseCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string }) => z.object({ id: idSchema, name: z.string().trim().min(1).max(50) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expense_categories").update({ name: data.name }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteExpenseCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expense_categories").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
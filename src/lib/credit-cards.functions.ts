import { financialSchema } from "./financial-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { creditCardInputSchema, invoiceInputSchema, invoicePaymentSchema } from "./credit-cards";

export const listCreditCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await financialSchema(context.supabase).rpc("list_credit_cards");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveCreditCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => creditCardInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("save_credit_card", {
      p_id: data.id,
      p_name: data.name,
      p_last_four: data.last_four,
      p_currency_code: data.currency_code,
      p_payment_account_id: data.payment_account_id,
      p_closing_day: data.closing_day,
      p_due_day: data.due_day,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const setCreditCardActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("set_credit_card_active", {
      p_id: data.id,
      p_is_active: data.is_active,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const listCreditCardInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await financialSchema(context.supabase).rpc("list_credit_card_invoices");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCreditCardInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => invoiceInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("create_credit_card_invoice", {
      p_card_id: data.card_id,
      p_period_start: data.period_start,
      p_period_end: data.period_end,
      p_closing_date: data.closing_date,
      p_due_date: data.due_date,
      p_total_text: data.total_amount.trim().replace(",", "."),
      p_source: data.source,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const closeCreditCardInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("close_credit_card_invoice", {
      p_invoice_id: data.invoice_id,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const reopenCreditCardInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("reopen_credit_card_invoice", {
      p_invoice_id: data.invoice_id,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const listUnlinkedInvoiceRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).default(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await financialSchema(context.supabase).rpc("list_unlinked_invoice_rows", {
      p_limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listCreditCardInvoiceItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await financialSchema(context.supabase).rpc("list_credit_card_invoice_items", {
      p_invoice_id: data.invoice_id,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const associateCreditCardInvoiceRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ invoice_id: z.string().uuid(), row_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("associate_credit_card_invoice_row", {
      p_invoice_id: data.invoice_id,
      p_row_id: data.row_id,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const unlinkCreditCardInvoiceRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ invoice_id: z.string().uuid(), row_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("unlink_credit_card_invoice_row", {
      p_invoice_id: data.invoice_id,
      p_row_id: data.row_id,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const recordCreditCardPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => invoicePaymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await financialSchema(context.supabase).rpc("record_credit_card_payment", {
      p_invoice_id: data.invoice_id,
      p_account_id: data.account_id,
      p_effective_date: data.effective_date,
      p_amount_text: data.amount.trim().replace(",", "."),
      p_idempotency_key: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const listCreditCardPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await financialSchema(context.supabase).rpc("list_credit_card_payments", {
      p_invoice_id: data.invoice_id,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

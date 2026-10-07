import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { importSchema, type ImportInput, type ImportResult } from "./invoice";

export const importInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ImportInput) => importSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("import_invoice_rows", {
      p_source: data.source, p_card: data.card ?? "", p_rows: data.rows,
      p_dry_run: !data.confirmed, p_acknowledge: data.acknowledgeDuplicates,
    });
    if (error) throw new Error(error.message);
    return result as unknown as ImportResult;
  });
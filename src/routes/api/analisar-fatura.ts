import { createFileRoute } from "@tanstack/react-router";
import { handleInvoiceAnalysis } from "@/lib/invoice-ai.server";

export const Route = createFileRoute("/api/analisar-fatura")({
  server: { handlers: { POST: ({ request }) => handleInvoiceAnalysis(request) } },
});
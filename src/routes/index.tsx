import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Month Check — Finanças pessoais" },
    { name: "description", content: "Organize entradas, gastos, parcelas e investimentos em um só lugar." },
    { property: "og:title", content: "Month Check — Finanças pessoais" },
    { property: "og:description", content: "Organize entradas, gastos, parcelas e investimentos em um só lugar." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/conferencia" });
  },
});

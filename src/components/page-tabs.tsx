import { Link, useRouterState } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";

const tabs = [
  { to: "/conferencia", label: "Conferência" },
  { to: "/visao-geral", label: "Visão Geral" },
  { to: "/parcelas", label: "Parcelas" },
  { to: "/investimentos", label: "Investimentos" },
  { to: "/contas", label: "Contas" },
  { to: "/movimentacoes", label: "Movimentações" },
  { to: "/faturas", label: "Cartões e faturas" },
  { to: "/beneficios", label: "Vale-alimentação" },
  { to: "/visao-futura", label: "Visão Futura" },
  { to: "/lancamentos", label: "Lançamentos" },
  { to: "/analisar-fatura", label: "Analisar fatura" },
] as const;

export function PageTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="hidden w-full items-center overflow-x-auto border-b border-border lg:flex">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={
              "shrink-0 whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium transition-colors " +
              (active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </Link>
        );
      })}
      <div className="ml-auto pl-3">
        <ThemeToggle />
      </div>
    </nav>
  );
}

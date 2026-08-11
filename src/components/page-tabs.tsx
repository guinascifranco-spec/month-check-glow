import { Link, useRouterState } from "@tanstack/react-router";

const tabs = [
  { to: "/conferencia", label: "Conferência" },
  { to: "/visao-geral", label: "Visão Geral" },
  { to: "/parcelas", label: "Parcelas" },
  { to: "/investimentos", label: "Investimentos" },
] as const;

export function PageTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="neu-inset hidden rounded-2xl p-1 lg:inline-flex">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={
              "rounded-xl px-4 py-2 text-sm font-semibold transition-all " +
              (active
                ? "neu-pressable text-primary"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

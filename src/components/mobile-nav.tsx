import { Link, useRouterState } from "@tanstack/react-router";
import { ListChecks, LayoutDashboard, CreditCard, TrendingUp, Telescope, ReceiptText } from "lucide-react";

const items = [
  { to: "/conferencia", label: "Conferência", Icon: ListChecks },
  { to: "/visao-geral", label: "Visão", Icon: LayoutDashboard },
  { to: "/parcelas", label: "Parcelas", Icon: CreditCard },
  { to: "/investimentos", label: "Invest.", Icon: TrendingUp },
  { to: "/visao-futura", label: "Futuro", Icon: Telescope },
  { to: "/lancamentos", label: "Lançamentos", Icon: ReceiptText },
] as const;

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação principal"
    >
      <div className="grid grid-cols-6">
        {items.map(({ to, label, Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={
                "flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 px-0.5 py-2 text-[10px] font-semibold transition-colors " +
                (active ? "text-primary" : "text-muted-foreground")
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import { ListChecks, LayoutDashboard, CreditCard, TrendingUp, Telescope, ReceiptText, MoreHorizontal, ScanText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";

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
  const [open, setOpen] = useState(false);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação principal"
    >
      <div className="grid grid-cols-5">
        {items.filter(i => i.to !== "/investimentos" && i.to !== "/visao-futura").map(({ to, label, Icon }) => {
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
        <Button variant="ghost" aria-label="Mais opções" onClick={() => setOpen(true)} className={`h-auto min-h-[56px] flex-col gap-1 rounded-none px-0.5 text-[10px] ${["/analisar-fatura", "/visao-futura", "/investimentos"].includes(pathname) ? "text-primary" : "text-muted-foreground"}`}><MoreHorizontal className="h-5 w-5" /><span>Mais</span></Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Mais opções</DialogTitle><DialogDescription>Navegação Month Check</DialogDescription></DialogHeader><div className="grid gap-2">{[{ to: "/investimentos", label: "Investimentos", Icon: TrendingUp }, { to: "/visao-futura", label: "Visão Futura", Icon: Telescope }, { to: "/analisar-fatura", label: "Analisar fatura", Icon: ScanText }].map(({ to, label, Icon }) => <Button asChild variant="ghost" className="justify-start" key={to}><Link to={to} onClick={() => setOpen(false)}><Icon className="mr-2 h-5 w-5" />{label}</Link></Button>)}<div className="border-t border-border pt-2"><ThemeToggle showLabel /></div></div></DialogContent></Dialog>
    </nav>
  );
}

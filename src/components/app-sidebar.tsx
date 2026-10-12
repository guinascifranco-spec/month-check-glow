import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  CreditCard,
  Landmark,
  ListChecks,
  LogOut,
  ReceiptText,
  ScanText,
  Telescope,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

const navigationGroups = [
  {
    label: "Planejamento",
    items: [
      { to: "/conferencia", label: "Conferência", icon: ListChecks },
      { to: "/visao-geral", label: "Visão Geral", icon: ChartNoAxesCombined },
      { to: "/visao-futura", label: "Visão Futura", icon: Telescope },
    ],
  },
  {
    label: "Dia a dia",
    items: [
      { to: "/lancamentos", label: "Lançamentos", icon: ReceiptText },
      { to: "/contas", label: "Contas", icon: Landmark },
      { to: "/movimentacoes", label: "Movimentações", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Compromissos",
    items: [
      { to: "/parcelas", label: "Parcelas", icon: CreditCard },
      { to: "/faturas", label: "Cartões e faturas", icon: CreditCard },
      { to: "/beneficios", label: "Vale-alimentação", icon: Wallet },
    ],
  },
  {
    label: "Patrimônio",
    items: [{ to: "/investimentos", label: "Investimentos", icon: TrendingUp }],
  },
  {
    label: "Ferramentas",
    items: [{ to: "/analisar-fatura", label: "Analisar fatura", icon: ScanText }],
  },
] as const;

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="border-b border-border p-3">
        <Link
          to="/conferencia"
          className="flex h-10 items-center gap-3 overflow-hidden rounded-md px-1"
          onClick={() => isMobile && setOpenMobile(false)}
        >
          <Logo height={30} className="shrink-0" />
          {!collapsed && (
            <span className="finance-app-title whitespace-nowrap text-base font-semibold">
              Month Check
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {navigationGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = pathname === item.to;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link
                          to={item.to}
                          aria-current={active ? "page" : undefined}
                          onClick={() => isMobile && setOpenMobile(false)}
                        >
                          <item.icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-2">
        <ThemeToggle showLabel={!collapsed} />
        <Button
          type="button"
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className={collapsed ? "h-8 w-8" : "h-9 justify-start px-2"}
          onClick={signOut}
          title="Sair da conta"
        >
          <LogOut aria-hidden="true" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
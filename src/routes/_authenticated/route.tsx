import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { InstallPWAButton } from "@/components/install-pwa-button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const currentLabel = routeLabels[pathname as keyof typeof routeLabels] ?? "Month Check";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center border-b border-border bg-background/95 px-3 backdrop-blur md:h-14 md:px-4">
          <SidebarTrigger className="h-9 w-9" aria-label="Abrir ou recolher menu" />
          <div className="ml-3 h-4 w-px bg-border" />
          <span className="ml-3 truncate text-sm font-medium">{currentLabel}</span>
          <div className="ml-auto">
            <InstallPWAButton className="[&_button]:min-h-9 [&_button]:rounded-md [&_button]:px-3 [&_button]:py-1.5" />
          </div>
        </header>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

const routeLabels = {
  "/conferencia": "Conferência",
  "/visao-geral": "Visão Geral",
  "/visao-futura": "Visão Futura",
  "/lancamentos": "Lançamentos",
  "/contas": "Contas",
  "/movimentacoes": "Movimentações",
  "/parcelas": "Parcelas",
  "/faturas": "Cartões e faturas",
  "/beneficios": "Vale-alimentação",
  "/investimentos": "Investimentos",
  "/analisar-fatura": "Analisar fatura",
} as const;

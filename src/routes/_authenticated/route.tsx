import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, LayoutDashboard, LogOut, Mail, Send, ShieldOff, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Wordmark } from "../index";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/campaigns", label: "Campaigns", icon: Send },
  { to: "/replies", label: "Replies", icon: Inbox },
  { to: "/accounts", label: "Sending accounts", icon: Mail },
  { to: "/suppression", label: "Suppression list", icon: ShieldOff },
] as const;

function AppShell() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-20 flex flex-col bg-sidebar text-sidebar-foreground md:h-screen">
        <div className="flex items-center justify-between px-5 py-4 md:py-6">
          <Link to="/dashboard" className="text-sidebar-accent-foreground">
            <Wordmark />
          </Link>
          <button onClick={signOut} className="text-sidebar-foreground/70 hover:text-sidebar-accent-foreground md:hidden" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0">
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className={cn("h-4 w-4", active && "text-sidebar-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden border-t border-sidebar-border px-5 py-4 md:block">
          <div className="truncate text-xs text-sidebar-foreground/60">{user.email}</div>
          <button onClick={signOut} className="mt-2 flex items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-accent-foreground">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

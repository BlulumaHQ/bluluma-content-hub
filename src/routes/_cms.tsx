import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { ClientProvider } from "@/contexts/ClientContext";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";

// Existing external CMS accounts are separate from managed Cloud accounts.
export const Route = createFileRoute("/_cms")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    if (!(await context.auth.verifyAdmin())) throw redirect({ to: "/login", replace: true });
  },
  component: CmsShell,
});
function CmsShell() {
  const { pathname } = useLocation();
  const portfolio = pathname === "/portfolio" || pathname.startsWith("/portfolio/");
  return <ClientProvider>
    <div className={`flex h-screen w-full overflow-hidden ${portfolio ? "[&>aside]:hidden md:[&>aside]:flex" : ""}`}>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar compactMobile={portfolio} />
        <main className="flex-1 overflow-auto bg-background p-6"><Outlet /></main>
      </div>
    </div>
  </ClientProvider>;
}

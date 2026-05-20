import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Image,
  Images,
  Settings,
} from "lucide-react";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Portfolio", url: "/portfolio", icon: Briefcase },
  { title: "Blog", url: "/blog", icon: FileText },
  { title: "Gallery", url: "/gallery", icon: Image },
  { title: "Media Library", url: "/media", icon: Images },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center border-b px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            B
          </div>
          <span className="font-semibold text-sidebar-foreground">Bluluma CMS</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-auto py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            currentPath === item.url ||
            (item.url !== "/" && currentPath.startsWith(item.url));
          return (
            <Link
              key={item.title}
              to={item.url}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">
        Bluluma CMS Admin v1.0
      </div>
    </aside>
  );
}

import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Images,
  Settings,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type LeafItem = { title: string; url: string };
type Group = {
  title: string;
  url?: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: LeafItem[];
};

const nav: Group[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  {
    title: "Clients",
    icon: Users,
    children: [
      { title: "All Clients", url: "/clients" },
      { title: "Add New Client", url: "/clients/new" },
    ],
  },
  {
    title: "Portfolio",
    icon: Briefcase,
    children: [
      { title: "All Portfolio", url: "/portfolio" },
      { title: "Add New Portfolio", url: "/portfolio/new" },
      { title: "Bulk Import Portfolio", url: "/portfolio/import" },
      { title: "Portfolio Categories", url: "/portfolio/categories" },
      { title: "Portfolio Tags", url: "/portfolio/tags" },
    ],
  },
  {
    title: "Blog",
    icon: FileText,
    children: [
      { title: "All Blog Posts", url: "/blog" },
      { title: "Add New Blog", url: "/blog/new" },
      { title: "Blog Categories", url: "/blog/categories" },
      { title: "Blog Tags", url: "/blog/tags" },
      { title: "Bulk Import Blog", url: "/blog/import" },
    ],
  },
  { title: "Media Library", url: "/media", icon: Images },
  { title: "Settings", url: "/settings", icon: Settings },
];

function isPathActive(currentPath: string, url: string) {
  if (url === "/") return currentPath === "/";
  return currentPath === url || currentPath.startsWith(url + "/");
}

export function AppSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    nav.forEach((g) => {
      if (g.children) {
        init[g.title] = g.children.some((c) => isPathActive(currentPath, c.url));
      }
    });
    return init;
  });

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-sidebar">
      <div className="flex h-16 items-center border-b px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            B
          </div>
          <span className="font-semibold text-sidebar-foreground">Bluluma CMS</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-auto py-4 px-3 space-y-0.5">
        {nav.map((item) => {
          if (!item.children) {
            const active = isPathActive(currentPath, item.url!);
            return (
              <Link
                key={item.title}
                to={item.url!}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          }

          const groupActive = item.children.some((c) => isPathActive(currentPath, c.url));
          const isOpen = open[item.title] ?? groupActive;

          return (
            <div key={item.title}>
              <button
                type="button"
                onClick={() => setOpen((p) => ({ ...p, [item.title]: !isOpen }))}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  groupActive
                    ? "text-sidebar-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </span>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              {isOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5 border-l pl-3">
                  {item.children.map((c) => {
                    const active = isPathActive(currentPath, c.url);
                    return (
                      <Link
                        key={c.url}
                        to={c.url}
                        className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        {c.title}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">
        Bluluma CMS Admin v1.0
      </div>
    </aside>
  );
}

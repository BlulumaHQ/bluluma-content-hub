import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  FileText,
  Images,
  CheckCircle2,
  Pencil,
  Users,
} from "lucide-react";
import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Bluluma CMS Admin" },
      { name: "description", content: "CMS Admin Dashboard" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { selectedClient, clients, setSelectedClient, isLoading: clientsLoading } =
    useClientContext();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient) return null;
      const [contentRes, mediaRes] = await Promise.all([
        supabase
          .from("content_items")
          .select("content_type, status")
          .eq("client_id", selectedClient.id),
        supabase
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .eq("client_id", selectedClient.id),
      ]);

      if (contentRes.error) throw contentRes.error;
      const items = contentRes.data ?? [];
      return {
        portfolio: items.filter((i) => i.content_type === "portfolio").length,
        blog: items.filter((i) => i.content_type === "blog").length,
        published: items.filter((i) => i.status === "published").length,
        draft: items.filter((i) => i.status === "draft").length,
        media: mediaRes.count ?? 0,
      };
    },
    enabled: !!selectedClient,
  });

  if (!selectedClient) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="rounded-xl border bg-card p-8 text-center">
          <Users className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Select a client to begin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            All content in this CMS belongs to a specific client. Pick the client you want to
            manage, or create a new one.
          </p>

          {clientsLoading ? (
            <div className="mt-6 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : clients.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClient(c)}
                  className="rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <p className="font-semibold text-foreground">{c.client_name}</p>
                  {c.industry && (
                    <p className="text-xs text-muted-foreground">{c.industry}</p>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              No clients exist yet. Create the first one to get started.
            </p>
          )}

          <div className="mt-6">
            <Link to="/clients/new">
              <Button>+ Add New Client</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cards = [
    { title: "Total Portfolio Items", value: stats?.portfolio ?? 0, icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Total Blog Posts", value: stats?.blog ?? 0, icon: FileText, color: "text-emerald-600", bg: "bg-emerald-50" },
    { title: "Published Content", value: stats?.published ?? 0, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { title: "Draft Content", value: stats?.draft ?? 0, icon: Pencil, color: "text-amber-600", bg: "bg-amber-50" },
    { title: "Media Assets", value: stats?.media ?? 0, icon: Images, color: "text-violet-600", bg: "bg-violet-50" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Overview for {selectedClient.client_name}
      </p>

      {isLoading ? (
        <div className="mt-6 flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((card) => (
            <div key={card.title} className="rounded-lg border bg-card p-5 transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{card.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

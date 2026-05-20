import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  FileText,
  Image,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";

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
  const { selectedClient } = useClientContext();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient) return null;
      const { data, error } = await supabase
        .from("content_items")
        .select("content_type, status")
        .eq("client_id", selectedClient.id);

      if (error) throw error;

      const items = data ?? [];
      return {
        portfolio: items.filter((i) => i.content_type === "portfolio").length,
        blog: items.filter((i) => i.content_type === "blog").length,
        gallery: items.filter((i) => i.content_type === "gallery").length,
        published: items.filter((i) => i.status === "published").length,
        draft: items.filter((i) => i.status === "draft").length,
      };
    },
    enabled: !!selectedClient,
  });

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to view dashboard.</p>
      </div>
    );
  }

  const cards = [
    {
      title: "Total Portfolio Items",
      value: stats?.portfolio ?? 0,
      icon: Briefcase,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Total Blog Posts",
      value: stats?.blog ?? 0,
      icon: FileText,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Total Gallery Items",
      value: stats?.gallery ?? 0,
      icon: Image,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      title: "Published Content",
      value: stats?.published ?? 0,
      icon: CheckCircle2,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      title: "Draft Content",
      value: stats?.draft ?? 0,
      icon: Pencil,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
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
            <div
              key={card.title}
              className="rounded-lg border bg-card p-5 transition-shadow hover:shadow-sm"
            >
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { PortfolioCard } from "@/components/portfolio/PortfolioCard";
import { Button } from "@/components/ui/button";
import type { ContentItem, PortfolioDetail } from "@/types";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Manage portfolio items" },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const { selectedClient } = useClientContext();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: items, isLoading, error } = useQuery({
    queryKey: ["portfolio", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient) return [];

      const { data: contentData, error: contentError } = await supabase
        .from("content_items")
        .select("*")
        .eq("client_id", selectedClient.id)
        .eq("content_type", "portfolio")
        .order("sort_order", { ascending: true });

      if (contentError) throw contentError;
      const contentItems = (contentData as ContentItem[]) ?? [];
      if (contentItems.length === 0) return [];

      const contentIds = contentItems.map((i) => i.id);
      const { data: detailsData, error: detailsError } = await supabase
        .from("portfolio_details")
        .select("*")
        .in("content_id", contentIds);

      if (detailsError) throw detailsError;

      const detailsMap = new Map<string, PortfolioDetail>();
      ((detailsData as PortfolioDetail[]) ?? []).forEach((d) => {
        detailsMap.set(d.content_id, d);
      });

      return contentItems.map((item) => ({
        ...item,
        portfolio_details: detailsMap.get(item.id),
      }));
    },
    enabled: !!selectedClient,
  });

  const handleDelete = async (id: string) => {
    if (!selectedClient) {
      toast.error("No client selected");
      return;
    }

    setDeletingId(id);
    try {
      const { error: detailsError } = await supabase
        .from("portfolio_details")
        .delete()
        .eq("content_id", id);

      if (detailsError) throw detailsError;

      const { error: contentError } = await supabase
        .from("content_items")
        .delete()
        .eq("id", id)
        .eq("client_id", selectedClient.id);

      if (contentError) throw contentError;

      toast.success("Portfolio item deleted");
      queryClient.invalidateQueries({ queryKey: ["portfolio", selectedClient.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", selectedClient.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to manage portfolio.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage portfolio items for {selectedClient.client_name}
          </p>
        </div>
        <Link to="/portfolio/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add New Portfolio
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-8 flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-destructive/20 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load portfolio items"}
          </p>
        </div>
      ) : items && items.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <PortfolioCard
              key={item.id}
              item={item}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <p className="text-muted-foreground">No portfolio items yet.</p>
          <Link to="/portfolio/new" className="mt-4">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add First Portfolio
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

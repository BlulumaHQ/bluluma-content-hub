import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { updatePortfolio, type PortfolioFormData } from "@/lib/portfolio";

import { PortfolioForm } from "@/components/portfolio/PortfolioForm";
import { GalleryManager } from "@/components/portfolio/GalleryManager";
import { CategoryTagPanel } from "@/components/portfolio/CategoryTagPanel";
import type { ContentItem, PortfolioDetail, PortfolioItem } from "@/types";

export const Route = createFileRoute("/portfolio/$id")({
  head: () => ({
    meta: [
      { title: "Edit Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Edit portfolio item" },
    ],
  }),
  component: EditPortfolioPage,
});

function EditPortfolioPage() {
  const { id } = Route.useParams();
  const { selectedClient } = useClientContext();
  const navigate = useNavigate();

  const { data: item, isLoading, error } = useQuery({
    queryKey: ["portfolio-item", id],
    queryFn: async () => {
      const { data: contentData, error: contentError } = await supabase
        .from("content_items")
        .select("*")
        .eq("id", id)
        .single();

      if (contentError) throw contentError;

      const { data: detailsData, error: detailsError } = await supabase
        .from("portfolio_details")
        .select("*")
        .eq("content_id", id)
        .single();

      if (detailsError && detailsError.code !== "PGRST116") throw detailsError;

      return {
        ...(contentData as ContentItem),
        portfolio_details: (detailsData as PortfolioDetail | undefined) ?? undefined,
      } as PortfolioItem;
    },
    enabled: !!id,
  });

  const handleSave = async (data: PortfolioFormData) => {
    await updatePortfolio(id, selectedClient!.id, data);
    toast.success("Portfolio updated successfully");
    navigate({ to: "/portfolio" });
  };


  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to edit portfolio.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Portfolio not found"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Edit Portfolio</h1>
      <p className="mt-1 text-sm text-muted-foreground">{item.title}</p>

      <div className="mt-6">
        <PortfolioForm client={selectedClient} initialData={item} onSave={handleSave} />
      </div>

      {/* Gallery management: view all photos, drag to reorder, set featured, add/delete */}
      <div className="mt-6 max-w-3xl">
        <GalleryManager contentId={item.id} clientId={selectedClient.id} />
      </div>

      {/* Category + tag assignment */}
      <div className="mt-6 max-w-3xl">
        <CategoryTagPanel contentId={item.id} clientId={selectedClient.id} />
      </div>
    </div>
  );
}

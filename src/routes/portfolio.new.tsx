import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { PortfolioForm } from "@/components/portfolio/PortfolioForm";

export const Route = createFileRoute("/portfolio/new")({
  head: () => ({
    meta: [
      { title: "New Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Add new portfolio item" },
    ],
  }),
  component: NewPortfolioPage,
});

function NewPortfolioPage() {
  const { selectedClient } = useClientContext();
  const navigate = useNavigate();

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to add portfolio.</p>
      </div>
    );
  }

  const handleSave = async (data: {
    title: string;
    slug: string;
    excerpt: string;
    body_content: string;
    featured_image_url: string;
    status: "draft" | "published" | "archived";
    is_featured: boolean;
    sort_order: number;
    live_url: string;
    services: string[];
    project_year: number | "";
    short_summary: string;
  }) => {
    // Compute next sort_order for this client so new items go to the end.
    let nextSort = data.sort_order && data.sort_order > 0 ? data.sort_order : 1;
    if (!data.sort_order || data.sort_order <= 0) {
      const { data: maxRow } = await supabase
        .from("content_items")
        .select("sort_order")
        .eq("client_id", selectedClient.id)
        .eq("content_type", "portfolio")
        .order("sort_order", { ascending: false, nullsFirst: false })
        .limit(1);
      nextSort = (maxRow?.[0]?.sort_order ?? 0) + 1;
    }

    const { data: contentData, error: contentError } = await supabase
      .from("content_items")
      .insert({
        client_id: selectedClient.id,
        content_type: "portfolio",
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt || null,
        body_content: data.body_content || null,
        featured_image_url: data.featured_image_url || null,
        status: data.status,
        is_featured: data.is_featured,
        sort_order: nextSort,
      })
      .select()
      .single();

    if (contentError) throw new Error(contentError.message);
    if (!contentData) throw new Error("Failed to create content item");

    const { error: detailsError } = await supabase.from("portfolio_details").insert({
      content_id: contentData.id,
      live_url: data.live_url || null,
      services: data.services.length > 0 ? data.services : null,
      client_name: data.title,
      project_year: data.project_year === "" ? null : data.project_year,
      short_summary: data.short_summary || null,
    });

    if (detailsError) throw new Error(detailsError.message);

    toast.success("Portfolio created successfully");
    navigate({ to: "/portfolio" });
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Add New Portfolio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a new portfolio item for {selectedClient.client_name}
      </p>

      <div className="mt-6">
        <PortfolioForm client={selectedClient} onSave={handleSave} />
      </div>
    </div>
  );
}

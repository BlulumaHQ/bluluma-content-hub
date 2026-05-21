import { useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { PortfolioItem, Client } from "@/types";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PortfolioForm } from "@/components/portfolio/PortfolioForm";

interface PortfolioCardProps {
  item: PortfolioItem;
  client: Client;
  onDelete: (id: string) => void;
  onEdited: () => void;
}

export function PortfolioCard({ item, client, onDelete, onEdited }: PortfolioCardProps) {
  const details = item.portfolio_details;
  const services = details?.services ?? [];
  const [editOpen, setEditOpen] = useState(false);

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
    try {
      const { error: contentError } = await supabase
        .from("content_items")
        .update({
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt || null,
          body_content: data.body_content || null,
          featured_image_url: data.featured_image_url || null,
          status: data.status,
          is_featured: data.is_featured,
          sort_order: data.sort_order,
        })
        .eq("id", item.id)
        .eq("client_id", client.id);

      if (contentError) throw contentError;

      const detailsPayload = {
        content_id: item.id,
        live_url: data.live_url || null,
        services: data.services.length > 0 ? data.services : null,
        client_name: data.title,
        project_year: data.project_year === "" ? null : data.project_year,
        short_summary: data.short_summary || null,
      };

      const { error: detailsError } = await supabase
        .from("portfolio_details")
        .upsert(detailsPayload, { onConflict: "content_id" });

      if (detailsError) throw detailsError;

      toast.success("Portfolio updated successfully");
      setEditOpen(false);
      onEdited();
    } catch (err) {
      console.error("[PortfolioCard] save failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
      throw err;
    }
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md">
      <div className="aspect-video overflow-hidden bg-muted">
        {item.featured_image_url ? (
          <img
            src={item.featured_image_url}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            No image
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-center justify-between">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              item.status === "published"
                ? "bg-green-100 text-green-700"
                : item.status === "draft"
                ? "bg-amber-100 text-amber-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {item.status}
          </span>
          {item.is_featured && (
            <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              Featured
            </span>
          )}
        </div>

        <h3 className="text-base font-semibold text-card-foreground line-clamp-1">
          {item.title}
        </h3>

        {item.excerpt && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {item.excerpt}
          </p>
        )}

        {services.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {services.slice(0, 3).map((s) => (
              <span
                key={s}
                className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {s}
              </span>
            ))}
            {services.length > 3 && (
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                +{services.length - 3}
              </span>
            )}
          </div>
        )}

        {details?.project_year && (
          <p className="mt-2 text-xs text-muted-foreground">
            Year: {details.project_year}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-4">
          {details?.live_url && (
            <a
              href={details.live_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Live Website
            </a>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Edit portfolio"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Portfolio</DialogTitle>
                  <DialogDescription>{item.title}</DialogDescription>
                </DialogHeader>
                <PortfolioForm
                  client={client}
                  initialData={item}
                  onSave={handleSave}
                  onCancel={() => setEditOpen(false)}
                />
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Portfolio</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete "{item.title}"? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={() => onDelete(item.id)}
                  >
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}

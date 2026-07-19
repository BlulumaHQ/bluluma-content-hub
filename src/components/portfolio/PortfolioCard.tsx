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
import { Checkbox } from "@/components/ui/checkbox";
import { PortfolioForm } from "@/components/portfolio/PortfolioForm";

interface PortfolioCardProps {
  item: PortfolioItem;
  client: Client;
  onDelete: (id: string) => void;
  onEdited: () => void;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
}

export function PortfolioCard({ item, client, onDelete, onEdited, selected, onToggleSelect }: PortfolioCardProps) {
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
      const sortOrderNum =
        typeof data.sort_order === "number" && !Number.isNaN(data.sort_order)
          ? data.sort_order
          : parseInt(String(data.sort_order ?? "0"), 10) || 0;

      const contentPayload = {
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt || null,
        body_content: data.body_content || null,
        featured_image_url: data.featured_image_url || null,
        status: data.status,
        is_featured: data.is_featured,
        sort_order: sortOrderNum,
        updated_at: new Date().toISOString(),
      };
      console.log("[PortfolioCard] updating content_items", item.id, contentPayload);

      const { error: contentError, status: contentStatus } = await supabase
        .from("content_items")
        .update(contentPayload)
        .eq("id", item.id)
        .eq("client_id", client.id);

      if (contentError) {
        console.error("[PortfolioCard] content_items update error", {
          status: contentStatus,
          ...contentError,
        });
        throw new Error(contentError.message || "Failed to update content_items");
      }

      const servicesArr = Array.isArray(data.services)
        ? data.services.map((s) => String(s).trim()).filter(Boolean)
        : [];

      const detailsPayload = {
        live_url: data.live_url ? data.live_url.trim() : null,
        services: servicesArr,
        client_name: data.title,
        project_year:
          data.project_year === "" || data.project_year === null || data.project_year === undefined
            ? null
            : String(data.project_year),
        short_summary: data.short_summary ? data.short_summary.trim() : null,
      };
      console.log("[PortfolioCard] saving portfolio_details", item.id, detailsPayload);

      const { data: existing, error: fetchError } = await supabase
        .from("portfolio_details")
        .select("id")
        .eq("content_id", item.id)
        .maybeSingle();

      if (fetchError) {
        console.error("[PortfolioCard] portfolio_details fetch error", fetchError);
        throw new Error(fetchError.message || "Failed to fetch portfolio_details");
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from("portfolio_details")
          .update(detailsPayload)
          .eq("content_id", item.id);
        if (updateError) {
          console.error("[PortfolioCard] portfolio_details update error", updateError);
          throw new Error(updateError.message || "Failed to update portfolio_details");
        }
      } else {
        const { error: insertError } = await supabase
          .from("portfolio_details")
          .insert({ ...detailsPayload, content_id: item.id });
        if (insertError) {
          console.error("[PortfolioCard] portfolio_details insert error", insertError);
          throw new Error(insertError.message || "Failed to insert portfolio_details");
        }
      }

      toast.success("Portfolio saved successfully");
      setEditOpen(false);
      onEdited();
    } catch (err) {
      console.error("[PortfolioCard] save failed", err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to save";
      toast.error(message);
      throw err;
    }
  };

  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md ${selected ? "ring-2 ring-primary" : ""}`}>
      {onToggleSelect && (
        <div className="absolute right-2 top-2 z-10 rounded-md bg-background/90 p-1 shadow">
          <Checkbox
            checked={!!selected}
            onCheckedChange={(v) => onToggleSelect(item.id, v === true)}
            aria-label="Select portfolio"
          />
        </div>
      )}
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

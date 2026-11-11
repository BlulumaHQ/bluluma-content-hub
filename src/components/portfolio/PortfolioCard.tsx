import { useEffect, useState } from "react";
import { ExternalLink, Pencil, Trash2, Check, Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

import type { PortfolioItem, Client } from "@/types";
import { updatePortfolio, type DynamicSaveInput, type PortfolioFormData } from "@/lib/portfolio";

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
import { GalleryManager } from "@/components/portfolio/GalleryManager";
import { PortfolioScreenshots } from "@/components/portfolio/PortfolioScreenshots";
import { PORTFOLIO_WEBSITES } from "@/lib/portfolio-editor";
import { publishWithDefaultSite, bulkSetShowOn } from "@/lib/portfolio-screenshots";
import { toggleSelection } from "@/lib/portfolio-editor";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface PortfolioCardProps {
  item: PortfolioItem;
  client: Client;
  onDelete: (id: string) => void;
  onEdited: () => void;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
  featured?: boolean;
  featuredPending?: boolean;
  onToggleFeatured?: (id: string) => void;
}

export function PortfolioCard({ item, client, onDelete, onEdited, selected, onToggleSelect, featured, featuredPending, onToggleFeatured }: PortfolioCardProps) {
  const details = item.portfolio_details;
  const services = details?.services ?? [];
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();
  const publish = useMutation({ mutationFn: () => publishWithDefaultSite(item, client.id), onSuccess: () => {
    toast.success("Portfolio published");
    onEdited();
    void queryClient.invalidateQueries({ queryKey: ["portfolio-item", item.id] });
  }, onError: (err) => toast.error(err instanceof Error ? err.message : "Could not publish") });

  const [showOn, setShowOn] = useState<string[]>(item.show_on ?? []);
  const [savingSite, setSavingSite] = useState(false);
  const savedSites = (item.show_on ?? []).join(",");
  useEffect(() => { setShowOn(savedSites ? savedSites.split(",") : []); }, [savedSites]);
  const toggleSite = async (value: string) => {
    if (savingSite) return;
    const previous = showOn;
    const next = toggleSelection(previous, value, !previous.includes(value));
    setShowOn(next);
    setSavingSite(true);
    try {
      await bulkSetShowOn([{ id: item.id, show_on: previous }], client.id, () => next);
      onEdited();
    } catch (err) {
      setShowOn(previous);
      toast.error(err instanceof Error ? err.message : "Could not update websites");
    } finally { setSavingSite(false); }
  };

  const handleSave = async (data: PortfolioFormData, dynamic: DynamicSaveInput) => {
    try {
      await updatePortfolio(item.id, client.id, data, dynamic, { preserveFeaturedImage: true, preserveClientName: true });
      toast.success("Portfolio saved successfully");
      setEditOpen(false);
      onEdited();
      void queryClient.invalidateQueries({ queryKey: ["portfolio-item", item.id] });
    } catch (err) {
      console.error("[PortfolioCard] save failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
      throw err;
    }
  };


  return (
    <div className={`group relative flex flex-col gap-3 overflow-hidden border-b bg-background p-3 sm:flex-row sm:items-center ${selected ? "ring-2 ring-primary" : ""}`}>
      {onToggleSelect && (
        <div className="absolute right-2 top-2 z-10 rounded-md bg-background/90 p-1 shadow">
          <Checkbox
            checked={!!selected}
            onCheckedChange={(v) => onToggleSelect(item.id, v === true)}
            aria-label="Select portfolio"
          />
        </div>
      )}
      <div className="relative ml-10 h-20 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
        {onToggleFeatured && (() => {
          const isOn = featured ?? item.is_featured;
          const label = isOn ? "Remove from featured" : "Mark as featured";
          return (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={label} aria-pressed={isOn}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFeatured(item.id); }}
                    className="absolute right-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-bl-md bg-background/80 backdrop-blur-sm hover:bg-background">
                    <Star className={`h-5 w-5 ${isOn ? "fill-[var(--featured)] text-[var(--featured)]" : "text-muted-foreground"}`} />
                    {featuredPending && <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}{featuredPending ? " (unsaved)" : ""}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })()}
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

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between">
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              item.status === "published"
                ? "bg-primary/10 text-primary"
                : item.status === "draft"
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {item.status}
          </span>
          {featuredPending && <span className="inline-flex rounded-full border border-destructive/40 px-2 py-0.5 text-xs font-medium text-destructive">Unsaved</span>}
          {(featured ?? item.is_featured) && (
            <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              Featured
            </span>
          )}
        </div>

        <h3 className="text-base font-semibold text-card-foreground line-clamp-1">
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{item.categories?.map((category) => category.name).join(" · ") || "Uncategorized"}</p>
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Show on websites">
          {PORTFOLIO_WEBSITES.map((w) => {
            const active = showOn.includes(w.value);
            return (
              <button key={w.value} type="button" aria-pressed={active} disabled={savingSite} onClick={() => toggleSite(w.value)}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-60 ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>
                {w.label}
              </button>
            );
          })}
        </div>

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
            {item.status === "draft" && <Button size="sm" disabled={publish.isPending} onClick={() => publish.mutate()}><Check />{publish.isPending ? "Publishing…" : "Publish"}</Button>}
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
                  hideFeaturedImage
                />
                {/* Project Images: featured + multi-image gallery (media_assets) */}
                <div className="mt-6 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Project Images</h3>
                    <p className="text-xs text-muted-foreground">
                      Featured Image is the project cover. Gallery holds all additional images.
                    </p>
                  </div>
                  <GalleryManager
                    contentId={item.id}
                    clientId={client.id}
                    featuredImageUrl={item.featured_image_url}
                    expectedGalleryCount={item.portfolio_details?.expected_gallery_count ?? null}
                    onFeaturedChange={onEdited}
                  />
                </div>
                <PortfolioScreenshots contentId={item.id} clientId={client.id} />
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

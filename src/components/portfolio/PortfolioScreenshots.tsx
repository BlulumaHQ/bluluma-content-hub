import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink, GripVertical, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { SCREENSHOT_TYPES, safeWebsiteUrl } from "@/lib/portfolio-editor";
import { requirePortfolioItem, updateScreenshot } from "@/lib/portfolio-screenshots";
import type { MediaAsset } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Version { id: string; label: string; url: string | null; screenshot_url: string | null; sort_order: number }
interface Props { contentId: string; clientId: string }

function ScreenshotTile({ asset, busy, onSave, onDelete }: { asset: MediaAsset; busy: boolean; onSave: (caption: string) => void; onDelete: () => void }) {
  const [caption, setCaption] = useState(asset.caption ?? "");
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: asset.id, disabled: busy });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="min-w-0 overflow-hidden rounded-md border bg-card">
    <div className="relative aspect-video bg-muted">
      <img src={asset.file_url} alt={asset.caption ?? "Screenshot"} className="h-full w-full object-contain" draggable={false} />
      <Button type="button" variant="secondary" size="icon" className="absolute left-1 top-1 touch-none" aria-label={`Reorder screenshot ${asset.caption || asset.id}`} title="Drag to reorder" disabled={busy} {...attributes} {...listeners}><GripVertical /></Button>
      <Button type="button" variant="destructive" size="icon" className="absolute right-1 top-1" aria-label={`Delete screenshot ${asset.caption || asset.id}`} title="Delete screenshot" disabled={busy} onClick={onDelete}><Trash2 /></Button>
    </div>
    <div className="flex gap-2 p-2">
      <Input aria-label={`Caption ${asset.id}`} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={busy} />
      <Button type="button" variant="outline" size="icon" aria-label={`Save caption ${asset.id}`} title="Save caption" disabled={busy || caption === (asset.caption ?? "")} onClick={() => onSave(caption)}><Save /></Button>
    </div>
  </div>;
}

export function PortfolioScreenshots({ contentId, clientId }: Props) {
  const queryClient = useQueryClient();
  const key = ["portfolio-screenshots", clientId, contentId];
  const [pendingDelete, setPendingDelete] = useState<{ kind: "version" | "screenshot"; id: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const { data, error, isLoading } = useQuery({ queryKey: key, queryFn: async () => {
    await requirePortfolioItem(contentId, clientId);
    const [versions, assets] = await Promise.all([
      supabase.from("portfolio_versions").select("id,label,url,screenshot_url,sort_order").eq("content_id", contentId).order("sort_order", { ascending: true }).order("id"),
      supabase.from("media_assets").select("id,file_url,file_type,caption,sort_order").eq("content_id", contentId).eq("client_id", clientId).in("file_type", SCREENSHOT_TYPES).order("sort_order", { ascending: true }).order("id"),
    ]);
    if (versions.error) throw new Error(versions.error.message);
    if (assets.error) throw new Error(assets.error.message);
    return { versions: versions.data as Version[], assets: assets.data as MediaAsset[] };
  } });
  const mutation = useMutation({ mutationFn: async (operation: () => Promise<void>) => operation(), onSuccess: async () => {
    setPendingDelete(null);
    await queryClient.invalidateQueries({ queryKey: key });
    toast.success("Saved");
  }, onError: (err) => { toast.error(err instanceof Error ? err.message : "Could not save"); void queryClient.invalidateQueries({ queryKey: key }); } });
  const deleteRecord = () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    mutation.mutate(async () => {
      await requirePortfolioItem(contentId, clientId);
      let query = supabase.from(target.kind === "version" ? "portfolio_versions" : "media_assets").delete().eq("id", target.id).eq("content_id", contentId);
      if (target.kind === "screenshot") query = query.eq("client_id", clientId).in("file_type", SCREENSHOT_TYPES);
      const { error } = await query.select("id").single();
      if (error) throw new Error(error.message);
      // Storage objects and featured-image references are intentionally retained.
    });
  };
  const reorder = ({ active, over }: DragEndEvent) => {
    if (!data || !over || active.id === over.id || mutation.isPending) return;
    const from = data.assets.findIndex((a) => a.id === active.id);
    const to = data.assets.findIndex((a) => a.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(data.assets, from, to);
    queryClient.setQueryData(key, { ...data, assets: next });
    mutation.mutate(async () => {
      for (const [i, asset] of next.entries()) await updateScreenshot(contentId, clientId, asset.id, { sort_order: i + 1 });
    });
  };
  if (isLoading) return <p className="py-4 text-sm text-muted-foreground">Loading versions and gallery…</p>;
  if (error) return <p role="alert" className="py-4 text-sm text-destructive">{error.message}</p>;
  return <div className="space-y-6">
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Versions</h2>
      {!data?.versions.length && <p className="text-sm text-muted-foreground">No versions.</p>}
      {data?.versions.map((version) => {
        const url = safeWebsiteUrl(version.url);
        return <div key={version.id} className="flex items-center gap-3 border-b py-3">
          {version.screenshot_url && <img src={version.screenshot_url} alt={`Version ${version.label}`} className="h-16 w-24 shrink-0 rounded border object-contain bg-muted" />}
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{version.label}</p>{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 break-all text-sm text-primary hover:underline">{version.url}<ExternalLink className="h-3 w-3 shrink-0" /></a> : <p className="break-all text-sm text-muted-foreground">{version.url}</p>}</div>
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete version ${version.label}`} title="Delete version" disabled={mutation.isPending} onClick={() => setPendingDelete({ kind: "version", id: version.id })}><Trash2 /></Button>
        </div>;
      })}
    </section>
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Gallery</h2>
      {!data?.assets.length && <p className="text-sm text-muted-foreground">No screenshots.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
        <SortableContext items={(data?.assets ?? []).map((a) => a.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">{data?.assets.map((asset) => <ScreenshotTile key={`${asset.id}:${asset.caption ?? ""}`} asset={asset} busy={mutation.isPending} onSave={(caption) => mutation.mutate(() => updateScreenshot(contentId, clientId, asset.id, { caption }))} onDelete={() => setPendingDelete({ kind: "screenshot", id: asset.id })} />)}</div>
        </SortableContext>
      </DndContext>
    </section>
    <Dialog open={!!pendingDelete} onOpenChange={(open) => { if (!open && !mutation.isPending) setPendingDelete(null); }}><DialogContent><DialogHeader><DialogTitle>Delete {pendingDelete?.kind}?</DialogTitle><DialogDescription>This removes the record. The stored image and featured image are kept.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setPendingDelete(null)}>Cancel</Button><Button variant="destructive" disabled={mutation.isPending} onClick={deleteRecord}>{mutation.isPending ? "Deleting…" : "Delete"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
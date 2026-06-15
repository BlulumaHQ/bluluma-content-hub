import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Star, Trash2, Upload, GripVertical, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Asset {
  id: string;
  file_url: string;
  is_featured: boolean;
  sort_order: number;
}

interface GalleryManagerProps {
  contentId: string;
  clientId: string;
  // Called after the featured image changes, so the parent can keep
  // content_items.featured_image_url in sync if it wants. Optional.
  onFeaturedChange?: (url: string) => void;
}

/**
 * Generic gallery manager for any portfolio item (any client/industry).
 * Reads/writes the `media_assets` table. Self-contained: it does its own
 * fetching and persistence, so it can be dropped into any edit page with
 * just <GalleryManager contentId={...} clientId={...} />.
 */
export function GalleryManager({ contentId, clientId, onFeaturedChange }: GalleryManagerProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("media_assets")
      .select("id, file_url, is_featured, sort_order")
      .eq("content_id", contentId)
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    setAssets((data as Asset[]) ?? []);
    setLoading(false);
  }, [contentId]);

  useEffect(() => {
    load();
  }, [load]);

  // --- Reorder (drag) ---
  const onDragStart = (i: number) => {
    dragIndex.current = i;
  };
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === i) return;
    setAssets((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
    dragIndex.current = i;
  };
  const persistOrder = async () => {
    dragIndex.current = null;
    setBusy(true);
    try {
      await Promise.all(
        assets.map((a, idx) =>
          supabase.from("media_assets").update({ sort_order: idx }).eq("id", a.id),
        ),
      );
      toast.success("Order saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save order");
      load();
    } finally {
      setBusy(false);
    }
  };

  // --- Set featured (hero) ---
  const setFeatured = async (asset: Asset) => {
    setBusy(true);
    try {
      await supabase.from("media_assets").update({ is_featured: false }).eq("content_id", contentId);
      await supabase.from("media_assets").update({ is_featured: true }).eq("id", asset.id);
      // Keep the content item's featured_image_url in sync (used by list views + site hero).
      await supabase
        .from("content_items")
        .update({ featured_image_url: asset.file_url })
        .eq("id", contentId);
      onFeaturedChange?.(asset.file_url);
      setAssets((prev) => prev.map((a) => ({ ...a, is_featured: a.id === asset.id })));
      toast.success("Featured image updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set featured");
    } finally {
      setBusy(false);
    }
  };

  // --- Delete ---
  const remove = async (asset: Asset) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
      if (error) throw error;
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      toast.success("Image removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  };

  // --- Add images ---
  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      let order = assets.length ? Math.max(...assets.map((a) => a.sort_order)) + 1 : 0;
      const hasFeatured = assets.some((a) => a.is_featured);
      const newRows: Asset[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop() ?? "png";
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `${clientId}/portfolio/${filename}`;
        const { error: upErr } = await supabase.storage
          .from("content-images")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("content-images").getPublicUrl(path);
        const isFeatured = !hasFeatured && newRows.length === 0;
        const { data: inserted, error: insErr } = await supabase
          .from("media_assets")
          .insert({
            client_id: clientId,
            content_id: contentId,
            file_url: pub.publicUrl,
            file_type: file.type || `image/${ext}`,
            is_featured: isFeatured,
            sort_order: order++,
          })
          .select("id, file_url, is_featured, sort_order")
          .single();
        if (insErr) throw insErr;
        newRows.push(inserted as Asset);
      }
      setAssets((prev) => [...prev, ...newRows]);
      toast.success(`Added ${newRows.length} image(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Gallery ({assets.length})</Label>
        <div className="flex items-center gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Add images
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onFiles}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag tiles to reorder. Click the star to set the featured (hero) image. The star image is the
        large image on the site; the rest become the thumbnail gallery in order.
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : assets.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No gallery images yet. Use “Add images”.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((a, i) => (
            <div
              key={a.id}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDragEnd={persistOrder}
              onDrop={persistOrder}
              className={`group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted ${
                a.is_featured ? "ring-2 ring-primary" : ""
              }`}
            >
              <img src={a.file_url} alt="" className="h-full w-full object-cover" draggable={false} />

              {/* drag handle */}
              <div className="absolute left-1 top-1 rounded bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <GripVertical className="h-3.5 w-3.5" />
              </div>

              {/* featured badge */}
              {a.is_featured && (
                <span className="absolute left-1 bottom-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Featured
                </span>
              )}

              {/* actions */}
              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Set as featured"
                  onClick={() => setFeatured(a)}
                  disabled={busy || a.is_featured}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary disabled:opacity-50"
                >
                  <Star className={`h-3 w-3 ${a.is_featured ? "fill-current" : ""}`} />
                </button>
                <button
                  type="button"
                  title="Remove"
                  onClick={() => remove(a)}
                  disabled={busy}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

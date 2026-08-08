import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Star, Trash2, Upload, GripVertical, Loader2, Pencil, ImageOff, AlertTriangle } from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  mapWithConcurrency,
  normalizeSortOrder,
  readImageSize,
  removeStoredFile,
  setFeaturedAsset,
  uploadPortfolioImage,
  extOf,
} from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Asset {
  id: string;
  file_url: string;
  is_featured: boolean;
  sort_order: number;
  original_filename?: string | null;
  width_px?: number | null;
  height_px?: number | null;
  alt_text?: string | null;
  alt_text_zh?: string | null;
  caption?: string | null;
  caption_zh?: string | null;
}

const SELECT_COLS =
  "id, file_url, is_featured, sort_order, original_filename, width_px, height_px, alt_text, alt_text_zh, caption, caption_zh";

interface GalleryManagerProps {
  contentId: string;
  clientId: string;
  /** content_items.featured_image_url as currently stored. */
  featuredImageUrl?: string | null;
  /** portfolio_details.expected_gallery_count, for the CMS-only validation hint. */
  expectedGalleryCount?: number | null;
  onFeaturedChange?: (url: string | null) => void;
}

/**
 * Featured Image + Project Gallery manager for any portfolio item.
 * Every image is an individual `media_assets` row linked by `content_id`,
 * the same records the bulk importer writes.
 */
export function GalleryManager({
  contentId,
  clientId,
  featuredImageUrl,
  expectedGalleryCount,
  onFeaturedChange,
}: GalleryManagerProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [featuredUrl, setFeaturedUrl] = useState<string | null>(featuredImageUrl ?? null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Asset | null>(null);
  const dragIndex = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const featuredInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: item }] = await Promise.all([
      supabase
        .from("media_assets")
        .select(SELECT_COLS)
        .eq("content_id", contentId)
        .order("sort_order", { ascending: true }),
      supabase.from("content_items").select("featured_image_url").eq("id", contentId).single(),
    ]);
    if (error) toast.error(error.message);
    setAssets((data as Asset[]) ?? []);
    setFeaturedUrl((item?.featured_image_url as string | null) ?? null);
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
    if (dragIndex.current === null) return;
    dragIndex.current = null;
    setBusy(true);
    try {
      // Normalize to a contiguous 1..N sequence — no gaps.
      await normalizeSortOrder(assets.map((a) => a.id));
      setAssets((prev) => prev.map((a, i) => ({ ...a, sort_order: i + 1 })));
      toast.success("Order saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save order");
      load();
    } finally {
      setBusy(false);
    }
  };

  // --- Featured ---
  const makeFeatured = async (asset: Asset) => {
    setBusy(true);
    try {
      await setFeaturedAsset(contentId, asset.id, asset.file_url);
      setAssets((prev) => prev.map((a) => ({ ...a, is_featured: a.id === asset.id })));
      setFeaturedUrl(asset.file_url);
      onFeaturedChange?.(asset.file_url);
      toast.success("Featured image updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set featured");
    } finally {
      setBusy(false);
    }
  };

  const clearFeatured = async () => {
    setBusy(true);
    try {
      await supabase.from("media_assets").update({ is_featured: false }).eq("content_id", contentId);
      await supabase.from("content_items").update({ featured_image_url: null }).eq("id", contentId);
      setAssets((prev) => prev.map((a) => ({ ...a, is_featured: false })));
      setFeaturedUrl(null);
      onFeaturedChange?.(null);
      toast.success("Featured image removed (gallery images kept)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove featured");
    } finally {
      setBusy(false);
    }
  };

  // --- Upload (shared by gallery + featured pickers) ---
  const uploadFiles = async (files: File[], markFirstFeatured: boolean) => {
    if (files.length === 0) return;
    setUploading(true);
    let order = assets.length ? Math.max(...assets.map((a) => a.sort_order || 0)) : 0;
    const created: Asset[] = [];
    const failures: string[] = [];
    try {
      // Bounded concurrency keeps large multi-selects responsive.
      const uploaded = await mapWithConcurrency(files, 3, async (file) => {
        try {
          const url = await uploadPortfolioImage(clientId, file);
          const size = await readImageSize(file);
          return { file, url, size };
        } catch (err) {
          failures.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
          return null;
        }
      });

      for (const u of uploaded) {
        if (!u) continue; // storage upload failed → never create a media row
        const { data: inserted, error: insErr } = await supabase
          .from("media_assets")
          .insert({
            client_id: clientId,
            content_id: contentId,
            file_url: u.url,
            file_type: u.file.type || `image/${extOf(u.file.name)}`,
            original_filename: u.file.name,
            width_px: u.size.width,
            height_px: u.size.height,
            is_featured: false,
            sort_order: ++order,
          })
          .select(SELECT_COLS)
          .single();
        if (insErr) {
          failures.push(`${u.file.name}: ${insErr.message}`);
          continue;
        }
        created.push(inserted as Asset);
      }

      if (created.length > 0) {
        setAssets((prev) => [...prev, ...created]);
        const shouldFeature = markFirstFeatured || (!featuredUrl && assets.length === 0);
        if (shouldFeature) await makeFeatured(created[0]);
        toast.success(`Added ${created.length} image(s)`);
      }
      if (failures.length > 0) {
        toast.error(`${failures.length} file(s) failed`, { description: failures.join(" · ") });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (featuredInputRef.current) featuredInputRef.current.value = "";
    }
  };

  // --- Delete ---
  const confirmDelete = async () => {
    const asset = pendingDelete;
    if (!asset) return;
    setPendingDelete(null);
    setBusy(true);
    try {
      const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
      if (error) throw error;
      await removeStoredFile(asset.file_url);
      const remaining = assets.filter((a) => a.id !== asset.id);
      setAssets(remaining);
      await normalizeSortOrder(remaining.map((a) => a.id));
      if (featuredUrl === asset.file_url) {
        await supabase.from("content_items").update({ featured_image_url: null }).eq("id", contentId);
        setFeaturedUrl(null);
        onFeaturedChange?.(null);
      }
      toast.success("Image removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
      load();
    } finally {
      setBusy(false);
    }
  };

  // --- Metadata ---
  const saveMeta = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("media_assets")
        .update({
          alt_text: editing.alt_text || null,
          alt_text_zh: editing.alt_text_zh || null,
          caption: editing.caption || null,
          caption_zh: editing.caption_zh || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
      setAssets((prev) => prev.map((a) => (a.id === editing.id ? { ...a, ...editing } : a)));
      setEditing(null);
      toast.success("Image details saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save details");
    } finally {
      setBusy(false);
    }
  };

  const missing =
    expectedGalleryCount && expectedGalleryCount > assets.length
      ? expectedGalleryCount - assets.length
      : 0;

  return (
    <div className="space-y-4">
      {/* ---------------- FEATURED IMAGE ---------------- */}
      <div className="space-y-3 rounded-lg border p-4">
        <Label className="text-sm font-medium">Featured Image</Label>
        <div className="flex items-start gap-4">
          <div className="h-28 w-40 shrink-0 overflow-hidden rounded-md border bg-muted">
            {featuredUrl ? (
              <img src={featuredUrl} alt="Featured" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
                <ImageOff className="h-5 w-5" />
                <span className="mt-1 text-[10px]">No featured image</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || busy}
                onClick={() => featuredInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" /> Change Featured Image
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!featuredUrl || busy}
                onClick={clearFeatured}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove Featured Image
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used for the project hero, cards and listing thumbnails. A new upload also joins the
              gallery — the featured image is never duplicated.
            </p>
          </div>
        </div>
        <input
          ref={featuredInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => uploadFiles(Array.from(e.target.files ?? []), true)}
        />
      </div>

      {/* ---------------- PROJECT GALLERY ---------------- */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Project Gallery</Label>
            <p className="text-xs text-muted-foreground">
              Gallery Images: {assets.length}
              {expectedGalleryCount ? ` / Expected: ${expectedGalleryCount}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload Images
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => uploadFiles(Array.from(e.target.files ?? []), false)}
            />
          </div>
        </div>

        {missing > 0 && (
          <p className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" /> {missing} image{missing > 1 ? "s" : ""} missing
            versus expected count
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Select multiple files to upload at once. Drag tiles to reorder, star to set the featured
          image, pencil to edit alt text and captions.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No gallery images yet. Use “Upload Images”.
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
                title={[a.original_filename, a.width_px && a.height_px ? `${a.width_px}×${a.height_px}` : null]
                  .filter(Boolean)
                  .join(" · ")}
                className={`group relative aspect-[4/3] overflow-hidden rounded-md border bg-muted ${
                  a.is_featured ? "ring-2 ring-primary" : ""
                }`}
              >
                <img
                  src={a.file_url}
                  alt={a.alt_text ?? a.original_filename ?? ""}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {i + 1}. {a.original_filename ?? ""}
                  {a.width_px && a.height_px ? ` · ${a.width_px}×${a.height_px}` : ""}
                </span>

                <div className="absolute left-1 top-1 rounded bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <GripVertical className="h-3.5 w-3.5" />
                </div>

                {a.is_featured && (
                  <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    Featured
                  </span>
                )}

                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title="Set as featured"
                    onClick={() => makeFeatured(a)}
                    disabled={busy || a.is_featured}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary disabled:opacity-50"
                  >
                    <Star className={`h-3 w-3 ${a.is_featured ? "fill-current" : ""}`} />
                  </button>
                  <button
                    type="button"
                    title="Edit alt text / caption"
                    onClick={() => setEditing(a)}
                    disabled={busy}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => setPendingDelete(a)}
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

      {/* ---------------- METADATA DIALOG ---------------- */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Image details</DialogTitle>
            <DialogDescription>{editing?.original_filename ?? "Image"}</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <img
                src={editing.file_url}
                alt={editing.alt_text ?? ""}
                className="h-40 w-full rounded-md border object-contain"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Alt text (EN)</Label>
                  <Input
                    value={editing.alt_text ?? ""}
                    onChange={(e) => setEditing({ ...editing, alt_text: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Alt text (繁中)</Label>
                  <Input
                    value={editing.alt_text_zh ?? ""}
                    onChange={(e) => setEditing({ ...editing, alt_text_zh: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Caption (EN)</Label>
                  <Input
                    value={editing.caption ?? ""}
                    onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Caption (繁中)</Label>
                  <Input
                    value={editing.caption_zh ?? ""}
                    onChange={(e) => setEditing({ ...editing, caption_zh: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Original filename: {editing.original_filename ?? "—"}
                {editing.width_px && editing.height_px
                  ? ` · ${editing.width_px}×${editing.height_px}`
                  : ""}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveMeta} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- DELETE CONFIRM ---------------- */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete image?</DialogTitle>
            <DialogDescription>
              {pendingDelete && featuredUrl === pendingDelete.file_url
                ? "This image is the current Featured Image. Deleting it leaves the project without a featured image until you pick another one."
                : "This removes the media record and the stored file. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {pendingDelete && featuredUrl === pendingDelete.file_url
                ? "Delete anyway"
                : "Delete image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { supabase } from "@/lib/supabase";

export const STORAGE_BUCKET = "content-images";

export const extOf = (n: string) =>
  n.lastIndexOf(".") >= 0 ? n.slice(n.lastIndexOf(".") + 1).toLowerCase() : "";

export const stripExt = (n: string) =>
  n.lastIndexOf(".") >= 0 ? n.slice(0, n.lastIndexOf(".")) : n;

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

/** Read intrinsic pixel dimensions from a local image file/blob. */
export function readImageSize(file: Blob): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve({ width: null, height: null });
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    };
    img.src = url;
  });
}

/** Upload one image into the existing per-client portfolio storage folder. */
export async function uploadPortfolioImage(clientId: string, file: File): Promise<string> {
  const ext = extOf(file.name) || "png";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${clientId}/portfolio/${filename}`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Best-effort removal of the stored object behind a public URL. */
export async function removeStoredFile(fileUrl: string) {
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const i = fileUrl.indexOf(marker);
  if (i < 0) return;
  const path = decodeURIComponent(fileUrl.slice(i + marker.length).split("?")[0]);
  if (!path) return;
  await supabase.storage.from(STORAGE_BUCKET).remove([path]);
}

/**
 * Make one media asset the project's featured image and keep
 * content_items.featured_image_url in sync. Exactly one asset stays featured.
 */
export async function setFeaturedAsset(contentId: string, assetId: string, fileUrl: string) {
  const { error: clearErr } = await supabase
    .from("media_assets")
    .update({ is_featured: false })
    .eq("content_id", contentId);
  if (clearErr) throw clearErr;
  const { error: setErr } = await supabase
    .from("media_assets")
    .update({ is_featured: true })
    .eq("id", assetId);
  if (setErr) throw setErr;
  const { error: ciErr } = await supabase
    .from("content_items")
    .update({ featured_image_url: fileUrl })
    .eq("id", contentId);
  if (ciErr) throw ciErr;
}

/** Persist a contiguous 1..N sort_order for the given asset ids in array order. */
export async function normalizeSortOrder(ids: string[]) {
  await Promise.all(
    ids.map((id, i) =>
      supabase
        .from("media_assets")
        .update({ sort_order: i + 1 })
        .eq("id", id),
    ),
  );
}

/** Run async work over items with a bounded concurrency. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

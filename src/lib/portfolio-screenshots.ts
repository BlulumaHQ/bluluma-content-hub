import { supabase } from "@/lib/supabase";
import { SCREENSHOT_TYPES } from "@/lib/portfolio-editor";

export async function requirePortfolioItem(contentId: string, clientId: string, client = supabase) {
  const { error } = await client.from("content_items").select("id").eq("id", contentId).eq("client_id", clientId).eq("content_type", "portfolio").single();
  if (error) throw new Error(error.message);
}

export async function publishPortfolioItem(contentId: string, clientId: string, client = supabase) {
  const { error } = await client.from("content_items")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", contentId).eq("client_id", clientId).eq("content_type", "portfolio").eq("status", "draft").select("id").single();
  if (error) throw new Error(error.message);
}

export async function updateScreenshot(contentId: string, clientId: string, id: string, payload: { caption?: string | null; sort_order?: number }, client = supabase) {
  await requirePortfolioItem(contentId, clientId, client);
  const { error } = await client.from("media_assets").update(payload).eq("id", id).eq("content_id", contentId).eq("client_id", clientId).in("file_type", SCREENSHOT_TYPES).select("id").single();
  if (error) throw new Error(error.message);
}
type Item = { id: string; show_on?: string[] | null };

function failIfShort(data: unknown[] | null, expected: number) {
  if ((data?.length ?? 0) !== expected) throw new Error(`Only ${data?.length ?? 0} of ${expected} items were updated`);
  return expected;
}

/** One batched status update scoped to client + portfolio. */
export async function bulkSetStatus(ids: string[], clientId: string, status: "draft" | "published", client = supabase) {
  const { data, error } = await client.from("content_items")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", ids).eq("client_id", clientId).eq("content_type", "portfolio").select("id");
  if (error) throw new Error(error.message);
  return failIfShort(data, ids.length);
}

/** One batched update when every item ends with the same show_on; otherwise one update per distinct result. */
export async function bulkSetShowOn(items: Item[], clientId: string, compute: (cur: string[] | null | undefined) => string[], client = supabase) {
  const groups = new Map<string, { value: string[]; ids: string[] }>();
  for (const item of items) {
    const value = compute(item.show_on);
    const key = JSON.stringify(value);
    const g = groups.get(key) ?? { value, ids: [] };
    g.ids.push(item.id);
    groups.set(key, g);
  }
  let total = 0;
  for (const g of groups.values()) {
    const { data, error } = await client.from("content_items")
      .update({ show_on: g.value, updated_at: new Date().toISOString() })
      .in("id", g.ids).eq("client_id", clientId).eq("content_type", "portfolio").select("id");
    if (error) throw new Error(error.message);
    total += failIfShort(data, g.ids.length);
  }
  return total;
}

/** Publish one draft; give it BluLuma when it has no websites. */
export async function publishWithDefaultSite(item: Item, clientId: string, client = supabase) {
  const show_on = item.show_on && item.show_on.length > 0 ? item.show_on : ["bluluma"];
  const { error } = await client.from("content_items")
    .update({ status: "published", show_on, updated_at: new Date().toISOString() })
    .eq("id", item.id).eq("client_id", clientId).eq("content_type", "portfolio").eq("status", "draft").select("id").single();
  if (error) throw new Error(error.message);
}

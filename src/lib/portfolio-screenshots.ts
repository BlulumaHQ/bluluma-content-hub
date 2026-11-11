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
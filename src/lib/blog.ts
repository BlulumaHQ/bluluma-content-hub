import { supabase } from "@/lib/supabase";
import type { BlogPost, Category, Tag } from "@/types";
import type { BlogFormData } from "@/components/blog/BlogForm";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export const DEFAULT_BLOG_CATEGORIES = [
  "News",
  "Events",
  "Board Members",
  "Community",
  "Media Coverage",
  "Announcements",
];

/** Ensure default blog categories exist for this client. No-op if already present. */
export async function ensureDefaultBlogCategories(clientId: string) {
  const { data: existing, error } = await supabase
    .from("categories")
    .select("name")
    .eq("category_type", "blog")
    .or(`client_id.eq.${clientId},client_id.is.null`);
  if (error) return; // best-effort, do not crash UI
  const haveNames = new Set((existing ?? []).map((c: { name: string }) => c.name.toLowerCase()));
  const toInsert = DEFAULT_BLOG_CATEGORIES.filter(
    (n) => !haveNames.has(n.toLowerCase())
  ).map((name, idx) => ({
    client_id: clientId,
    category_type: "blog",
    name,
    slug: slugify(name),
    sort_order: idx,
  }));
  if (toInsert.length === 0) return;
  await supabase.from("categories").insert(toInsert);
}

export async function fetchBlogPosts(clientId: string): Promise<BlogPost[]> {
  const { data: items, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("client_id", clientId)
    .eq("content_type", "blog");
  if (error) throw error;
  const list = (items as BlogPost[]) ?? [];
  if (list.length === 0) return [];

  const ids = list.map((i) => i.id);

  const [ccRes, ctRes] = await Promise.all([
    supabase
      .from("content_categories")
      .select("content_id, category_id, categories(*)")
      .in("content_id", ids),
    supabase
      .from("content_tags")
      .select("content_id, tag_id, tags(*)")
      .in("content_id", ids),
  ]);

  const catsByContent = new Map<string, Category[]>();
  ((ccRes.data as Array<{ content_id: string; categories: Category | Category[] | null }>) ?? []).forEach((r) => {
    if (!r.categories) return;
    const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
    if (!cat) return;
    const arr = catsByContent.get(r.content_id) ?? [];
    arr.push(cat);
    catsByContent.set(r.content_id, arr);
  });

  const tagsByContent = new Map<string, Tag[]>();
  ((ctRes.data as Array<{ content_id: string; tags: Tag | Tag[] | null }>) ?? []).forEach((r) => {
    if (!r.tags) return;
    const tg = Array.isArray(r.tags) ? r.tags[0] : r.tags;
    if (!tg) return;
    const arr = tagsByContent.get(r.content_id) ?? [];
    arr.push(tg);
    tagsByContent.set(r.content_id, arr);
  });

  const enriched = list.map((b) => ({
    ...b,
    categories: catsByContent.get(b.id) ?? [],
    tags: tagsByContent.get(b.id) ?? [],
  }));

  // sort: publish_date desc, nulls last; then updated_at desc
  enriched.sort((a, b) => {
    const ad = a.publish_date ? new Date(a.publish_date).getTime() : -Infinity;
    const bd = b.publish_date ? new Date(b.publish_date).getTime() : -Infinity;
    if (ad !== bd) return bd - ad;
    const au = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return bu - au;
  });

  return enriched;
}

export async function fetchBlogPost(id: string, clientId: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", id)
    .eq("client_id", clientId)
    .eq("content_type", "blog")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [ccRes, ctRes] = await Promise.all([
    supabase
      .from("content_categories")
      .select("category_id, categories(*)")
      .eq("content_id", id),
    supabase.from("content_tags").select("tag_id, tags(*)").eq("content_id", id),
  ]);

  const categories = ((ccRes.data as Array<{ categories: Category | Category[] | null }>) ?? [])
    .map((r) => (Array.isArray(r.categories) ? r.categories[0] : r.categories))
    .filter((c): c is Category => !!c);
  const tags = ((ctRes.data as Array<{ tags: Tag | Tag[] | null }>) ?? [])
    .map((r) => (Array.isArray(r.tags) ? r.tags[0] : r.tags))
    .filter((t): t is Tag => !!t);

  return { ...(data as BlogPost), categories, tags };
}

function buildContentPayload(form: BlogFormData) {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    excerpt: form.excerpt.trim() || null,
    body_content: form.body_content || null,
    featured_image_url: form.featured_image_url || null,
    status: form.status,
    is_featured: form.is_featured,
    sort_order: Number.isFinite(form.sort_order) ? form.sort_order : 0,
    seo_title: form.seo_title.trim() || null,
    seo_description: form.seo_description.trim() || null,
    publish_date: form.publish_date ? form.publish_date : null,
  };
}

async function syncCategories(contentId: string, categoryIds: string[]) {
  const { error: delErr } = await supabase
    .from("content_categories")
    .delete()
    .eq("content_id", contentId);
  if (delErr) throw delErr;
  if (categoryIds.length === 0) return;
  const rows = categoryIds.map((cid) => ({ content_id: contentId, category_id: cid }));
  const { error: insErr } = await supabase.from("content_categories").insert(rows);
  if (insErr) throw insErr;
}

async function createNewTags(clientId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const rows = names.map((name) => ({
    client_id: clientId,
    name,
    slug: slugify(name),
  }));
  const { data, error } = await supabase.from("tags").insert(rows).select("id");
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function syncTags(
  contentId: string,
  clientId: string,
  tagIds: string[],
  newTagNames: string[]
) {
  const newIds = await createNewTags(clientId, newTagNames);
  const allIds = [...tagIds, ...newIds];
  const { error: delErr } = await supabase
    .from("content_tags")
    .delete()
    .eq("content_id", contentId);
  if (delErr) throw delErr;
  if (allIds.length === 0) return;
  const rows = allIds.map((tid) => ({ content_id: contentId, tag_id: tid }));
  const { error: insErr } = await supabase.from("content_tags").insert(rows);
  if (insErr) throw insErr;
}

export async function createBlogPost(clientId: string, form: BlogFormData): Promise<string> {
  const payload = {
    ...buildContentPayload(form),
    client_id: clientId,
    content_type: "blog",
  };
  const { data, error } = await supabase
    .from("content_items")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    console.error("createBlogPost insert error:", error);
    throw error;
  }
  const id = (data as { id: string }).id;
  await syncCategories(id, form.category_ids);
  await syncTags(id, clientId, form.tag_ids, form.new_tag_names);
  return id;
}

export async function updateBlogPost(
  id: string,
  clientId: string,
  form: BlogFormData
): Promise<void> {
  const payload = {
    ...buildContentPayload(form),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("content_items")
    .update(payload)
    .eq("id", id)
    .eq("client_id", clientId)
    .eq("content_type", "blog");
  if (error) {
    console.error("updateBlogPost error:", error);
    throw error;
  }
  await syncCategories(id, form.category_ids);
  await syncTags(id, clientId, form.tag_ids, form.new_tag_names);
}

export async function deleteBlogPost(id: string, clientId: string): Promise<void> {
  await supabase.from("content_categories").delete().eq("content_id", id);
  await supabase.from("content_tags").delete().eq("content_id", id);
  const { error } = await supabase
    .from("content_items")
    .delete()
    .eq("id", id)
    .eq("client_id", clientId)
    .eq("content_type", "blog");
  if (error) throw error;
}

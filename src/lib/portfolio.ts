import { supabase } from "@/lib/supabase";
import type { PortfolioItem } from "@/types";

/** Every field the expanded Portfolio form manages. */
export interface PortfolioFormData {
  // content_items
  title: string;
  title_zh: string;
  slug: string;
  excerpt: string;
  excerpt_zh: string;
  body_content: string;
  body_content_zh: string;
  featured_image_url: string;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  sort_order: number;
  seo_title: string;
  seo_title_zh: string;
  seo_description: string;
  seo_description_zh: string;

  // portfolio_details — general
  live_url: string;
  services: string[];
  project_year: string;
  short_summary: string;
  location: string;
  role: string;

  // location
  city: string;
  province: string;
  country: string;

  // timeline
  project_status: string;
  year_started: string;
  year_completed: string;

  // size & scale
  floor_area_value: string;
  floor_area_unit: string;
  site_area_value: string;
  site_area_unit: string;
  units_count: string;
  storeys_count: string;
  parking_spaces: string;
  construction_budget: string;

  // description
  scope_of_work: string;
  scope_of_work_zh: string;
  key_features: string;
  key_features_zh: string;

  // credits
  design_architect: string;
  architect_of_record: string;
  interior_designer: string;
  landscape_architect: string;
  structural_engineer: string;
  mechanical_engineer: string;
  electrical_engineer: string;
  civil_engineer: string;
  other_consultants: string;
  general_contractor: string;
  developer_owner_client: string;
  photographer: string;
  other_credits: string;

  // recognition
  awards: string;
  publications: string;

  // migration
  original_website_content: string;
  internal_notes: string;
  image_prefix: string;
  expected_gallery_count: string;
}

const txt = (v: string | undefined | null) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

const num = (v: string | undefined | null) => {
  const s = (v ?? "").toString().trim();
  if (s === "") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const int = (v: string | undefined | null) => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

export function emptyPortfolioForm(): PortfolioFormData {
  return {
    title: "", title_zh: "", slug: "", excerpt: "", excerpt_zh: "",
    body_content: "", body_content_zh: "", featured_image_url: "",
    status: "draft", is_featured: false, sort_order: 0,
    seo_title: "", seo_title_zh: "", seo_description: "", seo_description_zh: "",
    live_url: "", services: [], project_year: "", short_summary: "",
    location: "", role: "", city: "", province: "", country: "",
    project_status: "", year_started: "", year_completed: "",
    floor_area_value: "", floor_area_unit: "sq ft", site_area_value: "",
    site_area_unit: "sq ft", units_count: "", storeys_count: "",
    parking_spaces: "", construction_budget: "",
    scope_of_work: "", scope_of_work_zh: "", key_features: "", key_features_zh: "",
    design_architect: "", architect_of_record: "", interior_designer: "",
    landscape_architect: "", structural_engineer: "", mechanical_engineer: "",
    electrical_engineer: "", civil_engineer: "", other_consultants: "",
    general_contractor: "", developer_owner_client: "", photographer: "",
    other_credits: "", awards: "", publications: "",
    original_website_content: "", internal_notes: "", image_prefix: "",
    expected_gallery_count: "",
  };
}

export function portfolioFormFrom(item: PortfolioItem): PortfolioFormData {
  const d = item.portfolio_details;
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    ...emptyPortfolioForm(),
    title: item.title ?? "",
    title_zh: s(item.title_zh),
    slug: item.slug ?? "",
    excerpt: s(item.excerpt),
    excerpt_zh: s(item.excerpt_zh),
    body_content: s(item.body_content),
    body_content_zh: s(item.body_content_zh),
    featured_image_url: s(item.featured_image_url),
    status: item.status ?? "draft",
    is_featured: item.is_featured ?? false,
    sort_order: item.sort_order ?? 0,
    seo_title: s(item.seo_title),
    seo_title_zh: s(item.seo_title_zh),
    seo_description: s(item.seo_description),
    seo_description_zh: s(item.seo_description_zh),
    live_url: s(d?.live_url),
    services: d?.services ?? [],
    project_year: s(d?.project_year),
    short_summary: s(d?.short_summary),
    location: s(d?.location),
    role: s(d?.role),
    city: s(d?.city),
    province: s(d?.province),
    country: s(d?.country),
    project_status: s(d?.project_status),
    year_started: s(d?.year_started),
    year_completed: s(d?.year_completed),
    floor_area_value: s(d?.floor_area_value),
    floor_area_unit: d?.floor_area_unit ?? "sq ft",
    site_area_value: s(d?.site_area_value),
    site_area_unit: d?.site_area_unit ?? "sq ft",
    units_count: s(d?.units_count),
    storeys_count: s(d?.storeys_count),
    parking_spaces: s(d?.parking_spaces),
    construction_budget: s(d?.construction_budget),
    scope_of_work: s(d?.scope_of_work),
    scope_of_work_zh: s(d?.scope_of_work_zh),
    key_features: s(d?.key_features),
    key_features_zh: s(d?.key_features_zh),
    design_architect: s(d?.design_architect),
    architect_of_record: s(d?.architect_of_record),
    interior_designer: s(d?.interior_designer),
    landscape_architect: s(d?.landscape_architect),
    structural_engineer: s(d?.structural_engineer),
    mechanical_engineer: s(d?.mechanical_engineer),
    electrical_engineer: s(d?.electrical_engineer),
    civil_engineer: s(d?.civil_engineer),
    other_consultants: s(d?.other_consultants),
    general_contractor: s(d?.general_contractor),
    developer_owner_client: s(d?.developer_owner_client),
    photographer: s(d?.photographer),
    other_credits: s(d?.other_credits),
    awards: s(d?.awards),
    publications: s(d?.publications),
    original_website_content: s(d?.original_website_content),
    internal_notes: s(d?.internal_notes),
    image_prefix: s(d?.image_prefix),
    expected_gallery_count: s(d?.expected_gallery_count),
  };
}

/** Only columns that exist on content_items. */
export function buildContentPayload(data: PortfolioFormData) {
  return {
    title: data.title.trim(),
    title_zh: txt(data.title_zh),
    slug: data.slug.trim(),
    excerpt: txt(data.excerpt),
    excerpt_zh: txt(data.excerpt_zh),
    body_content: txt(data.body_content),
    body_content_zh: txt(data.body_content_zh),
    featured_image_url: txt(data.featured_image_url),
    status: data.status,
    is_featured: data.is_featured,
    sort_order: Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0,
    seo_title: txt(data.seo_title),
    seo_title_zh: txt(data.seo_title_zh),
    seo_description: txt(data.seo_description),
    seo_description_zh: txt(data.seo_description_zh),
    updated_at: new Date().toISOString(),
  };
}

/** Only columns that exist on portfolio_details. */
export function buildDetailsPayload(data: PortfolioFormData) {
  const services = Array.isArray(data.services)
    ? data.services.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return {
    live_url: txt(data.live_url),
    services: services.length ? services : null,
    client_name: data.title.trim(),
    project_year: txt(data.project_year),
    short_summary: txt(data.short_summary),
    location: txt(data.location),
    role: txt(data.role),
    city: txt(data.city),
    province: txt(data.province),
    country: txt(data.country),
    project_status: txt(data.project_status),
    year_started: txt(data.year_started),
    year_completed: txt(data.year_completed),
    floor_area_value: num(data.floor_area_value),
    floor_area_unit: txt(data.floor_area_unit),
    site_area_value: num(data.site_area_value),
    site_area_unit: txt(data.site_area_unit),
    units_count: int(data.units_count),
    storeys_count: int(data.storeys_count),
    parking_spaces: int(data.parking_spaces),
    construction_budget: txt(data.construction_budget),
    scope_of_work: txt(data.scope_of_work),
    scope_of_work_zh: txt(data.scope_of_work_zh),
    key_features: txt(data.key_features),
    key_features_zh: txt(data.key_features_zh),
    design_architect: txt(data.design_architect),
    architect_of_record: txt(data.architect_of_record),
    interior_designer: txt(data.interior_designer),
    landscape_architect: txt(data.landscape_architect),
    structural_engineer: txt(data.structural_engineer),
    mechanical_engineer: txt(data.mechanical_engineer),
    electrical_engineer: txt(data.electrical_engineer),
    civil_engineer: txt(data.civil_engineer),
    other_consultants: txt(data.other_consultants),
    general_contractor: txt(data.general_contractor),
    developer_owner_client: txt(data.developer_owner_client),
    photographer: txt(data.photographer),
    other_credits: txt(data.other_credits),
    awards: txt(data.awards),
    publications: txt(data.publications),
    original_website_content: txt(data.original_website_content),
    internal_notes: txt(data.internal_notes),
    image_prefix: txt(data.image_prefix),
    expected_gallery_count: int(data.expected_gallery_count),
    updated_at: new Date().toISOString(),
  };
}

/** Update an existing portfolio item (content_items + portfolio_details upsert). */
export async function updatePortfolio(
  contentId: string,
  clientId: string,
  data: PortfolioFormData,
) {
  const contentPayload = buildContentPayload(data);
  const { error: contentError } = await supabase
    .from("content_items")
    .update(contentPayload)
    .eq("id", contentId)
    .eq("client_id", clientId);
  if (contentError) {
    console.error("[portfolio] content_items update error", contentError);
    throw new Error(contentError.message);
  }

  const detailsPayload = buildDetailsPayload(data);
  const { data: existing, error: fetchError } = await supabase
    .from("portfolio_details")
    .select("id")
    .eq("content_id", contentId)
    .maybeSingle();
  if (fetchError) {
    console.error("[portfolio] portfolio_details fetch error", fetchError);
    throw new Error(fetchError.message);
  }

  if (existing) {
    const { error } = await supabase
      .from("portfolio_details")
      .update(detailsPayload)
      .eq("content_id", contentId);
    if (error) {
      console.error("[portfolio] portfolio_details update error", error);
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase
      .from("portfolio_details")
      .insert({ ...detailsPayload, content_id: contentId });
    if (error) {
      console.error("[portfolio] portfolio_details insert error", error);
      throw new Error(error.message);
    }
  }
}

/** Create a new portfolio item, returns the new content_items id. */
export async function createPortfolio(clientId: string, data: PortfolioFormData) {
  let sort = Number(data.sort_order);
  if (!Number.isFinite(sort) || sort <= 0) {
    const { data: maxRow } = await supabase
      .from("content_items")
      .select("sort_order")
      .eq("client_id", clientId)
      .eq("content_type", "portfolio")
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1);
    sort = (maxRow?.[0]?.sort_order ?? 0) + 1;
  }

  const { data: created, error: contentError } = await supabase
    .from("content_items")
    .insert({
      ...buildContentPayload({ ...data, sort_order: sort }),
      client_id: clientId,
      content_type: "portfolio",
    })
    .select("id")
    .single();
  if (contentError) {
    console.error("[portfolio] content_items insert error", contentError);
    throw new Error(contentError.message);
  }

  const { error: detailsError } = await supabase
    .from("portfolio_details")
    .insert({ ...buildDetailsPayload(data), content_id: created.id });
  if (detailsError) {
    console.error("[portfolio] portfolio_details insert error", detailsError);
    throw new Error(detailsError.message);
  }

  return created.id as string;
}

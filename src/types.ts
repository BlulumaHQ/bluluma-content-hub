export interface Client {
  id: string;
  client_name: string;
  company_name_zh?: string | null;
  slug?: string | null;
  website_url: string | null;
  industry: string | null;
  logo_url?: string | null;
  brand_primary_color: string | null;
  default_locale?: string | null;
  supported_locales?: string[] | null;
  status?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ContentItem {
  id: string;
  client_id: string;
  content_type: string;
  title: string;
  title_zh?: string | null;
  slug: string;
  excerpt: string | null;
  excerpt_zh?: string | null;
  body_content: string | null;
  body_content_zh?: string | null;
  featured_image_url: string | null;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  sort_order: number;
  seo_title?: string | null;
  seo_title_zh?: string | null;
  seo_description?: string | null;
  seo_description_zh?: string | null;
  publish_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PortfolioDetail {
  id: string;
  content_id: string;

  // Legacy / general
  live_url: string | null;
  services: string[] | null;
  client_name: string | null;
  project_year: string | null;
  short_summary: string | null;
  location: string | null;
  role: string | null;

  // Location
  city: string | null;
  province: string | null;
  country: string | null;

  // Timeline / status
  project_status: string | null;
  year_started: string | null;
  year_completed: string | null;

  // Size & scale
  floor_area_value: number | null;
  floor_area_unit: string | null;
  site_area_value: number | null;
  site_area_unit: string | null;
  units_count: number | null;
  storeys_count: number | null;
  parking_spaces: number | null;
  construction_budget: string | null;

  // Description
  scope_of_work: string | null;
  scope_of_work_zh: string | null;
  key_features: string | null;
  key_features_zh: string | null;

  // Credits
  design_architect: string | null;
  architect_of_record: string | null;
  interior_designer: string | null;
  landscape_architect: string | null;
  structural_engineer: string | null;
  mechanical_engineer: string | null;
  electrical_engineer: string | null;
  civil_engineer: string | null;
  other_consultants: string | null;
  general_contractor: string | null;
  developer_owner_client: string | null;
  photographer: string | null;
  other_credits: string | null;

  // Recognition
  awards: string | null;
  publications: string | null;

  // Migration
  original_website_content: string | null;
  internal_notes: string | null;
  image_prefix: string | null;
  expected_gallery_count: number | null;
  additional_project_data?: unknown;

  created_at?: string;
  updated_at?: string;
}

export interface PortfolioItem extends ContentItem {
  portfolio_details?: PortfolioDetail;
}

export interface Category {
  id: string;
  client_id: string | null;
  category_type: string;
  name: string;
  name_zh?: string | null;
  slug: string | null;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Tag {
  id: string;
  client_id: string | null;
  category_id?: string | null;
  parent_tag_id?: string | null;
  tag_level?: number | null;
  name: string;
  name_zh?: string | null;
  slug: string | null;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BlogPost extends ContentItem {
  categories?: Category[];
  tags?: Tag[];
}

export interface MediaAsset {
  id: string;
  client_id: string;
  content_id?: string | null;
  file_name?: string;
  original_filename?: string | null;
  file_url: string;
  file_type: string | null;
  file_size?: number | null;
  alt_text?: string | null;
  alt_text_zh?: string | null;
  caption?: string | null;
  caption_zh?: string | null;
  image_credit?: string | null;
  width_px?: number | null;
  height_px?: number | null;
  is_featured?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

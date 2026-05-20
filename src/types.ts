export interface Client {
  id: string;
  client_name: string;
  website_url: string | null;
  industry: string | null;
  brand_primary_color: string | null;
  status?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface ContentItem {
  id: string;
  client_id: string;
  content_type: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body_content: string | null;
  featured_image_url: string | null;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface PortfolioDetail {
  id: string;
  content_id: string;
  live_url: string | null;
  services: string[] | null;
  client_name: string | null;
  project_year: number | null;
  short_summary: string | null;
  created_at?: string;
}

export interface PortfolioItem extends ContentItem {
  portfolio_details?: PortfolioDetail;
}

export interface MediaAsset {
  id: string;
  client_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at?: string;
}

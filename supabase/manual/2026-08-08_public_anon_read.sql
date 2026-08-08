-- Bluluma CMS — read-only public (anon) access for PUBLISHED portfolio content.
-- Run this in the SQL editor of the external Supabase project that holds the CMS data
-- (uzdjwpkgldzhnoxjeyrw). It does NOT alter any table schema and does NOT modify
-- existing authenticated/admin policies.
--
-- Safety notes:
--   * anon gets SELECT only. No INSERT / UPDATE / DELETE anywhere.
--   * portfolio_details.internal_notes and .original_website_content are NEVER
--     granted to anon (column-level grant), and a public view omits them.

begin;

-- ---------------------------------------------------------------------------
-- 1. GRANTs (SELECT only)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon;

grant select on public.clients            to anon;
grant select on public.content_items      to anon;
grant select on public.categories         to anon;
grant select on public.content_categories to anon;
grant select on public.tags               to anon;
grant select on public.content_tags       to anon;
grant select on public.media_assets       to anon;

-- portfolio_details: column-level grant that EXCLUDES the sensitive columns.
grant select (
  id, content_id,
  live_url, services, client_name, project_year, short_summary, location, role,
  architect_roles,
  city, province, country,
  project_status, year_started, year_completed,
  floor_area_value, floor_area_unit, site_area_value, site_area_unit,
  units_count, storeys_count, parking_spaces, construction_budget,
  scope_of_work, scope_of_work_zh, key_features, key_features_zh,
  design_architect, architect_of_record, interior_designer, landscape_architect,
  structural_engineer, mechanical_engineer, electrical_engineer, civil_engineer,
  other_consultants, general_contractor, developer_owner_client, photographer,
  other_credits,
  awards, publications,
  image_prefix, expected_gallery_count, additional_project_data,
  created_at, updated_at
) on public.portfolio_details to anon;

-- ---------------------------------------------------------------------------
-- 2. RLS + anon-only SELECT policies (additive; existing policies untouched)
-- ---------------------------------------------------------------------------
alter table public.clients            enable row level security;
alter table public.content_items      enable row level security;
alter table public.portfolio_details  enable row level security;
alter table public.categories         enable row level security;
alter table public.content_categories enable row level security;
alter table public.tags               enable row level security;
alter table public.content_tags       enable row level security;
alter table public.media_assets       enable row level security;

drop policy if exists "anon read clients" on public.clients;
create policy "anon read clients"
  on public.clients for select to anon
  using (true);

drop policy if exists "anon read published content" on public.content_items;
create policy "anon read published content"
  on public.content_items for select to anon
  using (status = 'published');

drop policy if exists "anon read published portfolio details" on public.portfolio_details;
create policy "anon read published portfolio details"
  on public.portfolio_details for select to anon
  using (exists (
    select 1 from public.content_items ci
    where ci.id = portfolio_details.content_id
      and ci.status = 'published'
  ));

drop policy if exists "anon read published media" on public.media_assets;
create policy "anon read published media"
  on public.media_assets for select to anon
  using (exists (
    select 1 from public.content_items ci
    where ci.id = media_assets.content_id
      and ci.status = 'published'
  ));

drop policy if exists "anon read published content categories" on public.content_categories;
create policy "anon read published content categories"
  on public.content_categories for select to anon
  using (exists (
    select 1 from public.content_items ci
    where ci.id = content_categories.content_id
      and ci.status = 'published'
  ));

drop policy if exists "anon read published content tags" on public.content_tags;
create policy "anon read published content tags"
  on public.content_tags for select to anon
  using (exists (
    select 1 from public.content_items ci
    where ci.id = content_tags.content_id
      and ci.status = 'published'
  ));

drop policy if exists "anon read categories" on public.categories;
create policy "anon read categories"
  on public.categories for select to anon
  using (true);

drop policy if exists "anon read tags" on public.tags;
create policy "anon read tags"
  on public.tags for select to anon
  using (true);

-- ---------------------------------------------------------------------------
-- 3. Public view that omits sensitive columns (security_invoker = on, so RLS
--    on the base table still applies as the calling role).
-- ---------------------------------------------------------------------------
create or replace view public.portfolio_details_public
with (security_invoker = on) as
select
  id, content_id,
  live_url, services, client_name, project_year, short_summary, location, role,
  architect_roles,
  city, province, country,
  project_status, year_started, year_completed,
  floor_area_value, floor_area_unit, site_area_value, site_area_unit,
  units_count, storeys_count, parking_spaces, construction_budget,
  scope_of_work, scope_of_work_zh, key_features, key_features_zh,
  design_architect, architect_of_record, interior_designer, landscape_architect,
  structural_engineer, mechanical_engineer, electrical_engineer, civil_engineer,
  other_consultants, general_contractor, developer_owner_client, photographer,
  other_credits,
  awards, publications,
  image_prefix, expected_gallery_count, additional_project_data,
  created_at, updated_at
from public.portfolio_details;

grant select on public.portfolio_details_public to anon, authenticated;

commit;

-- PART 1 — SAFE, NON-BREAKING.
-- Creates read-only public views for published Portfolio content.
-- Run in the SQL editor of the CMS Supabase project (uzdjwpkgldzhnoxjeyrw).
--
-- Nothing is dropped, no columns change, no existing policy is touched,
-- and the CMS admin keeps working exactly as today.
--
-- These are SECURITY DEFINER views (the default): the filtering below is
-- enforced regardless of the caller's role, so anon can never see drafts
-- or internal fields through them.

begin;

-- ---- clients: public identity only -----------------------------------------
create or replace view public.public_clients as
select id, client_name, company_name_zh, slug, website_url, industry,
       logo_url, brand_primary_color, default_locale, supported_locales
from public.clients;

-- ---- published content items ------------------------------------------------
create or replace view public.public_content_items as
select id, client_id, content_type, title, title_zh, slug,
       excerpt, excerpt_zh, body_content, body_content_zh,
       featured_image_url, is_featured, sort_order,
       seo_title, seo_title_zh, seo_description, seo_description_zh,
       publish_date, created_at, updated_at
from public.content_items
where status = 'published';

-- ---- portfolio details, WITHOUT internal_notes / original_website_content ---
create or replace view public.public_portfolio_details as
select d.id, d.content_id,
       d.live_url, d.services, d.client_name, d.project_year, d.short_summary,
       d.location, d.role, d.architect_roles,
       d.city, d.province, d.country,
       d.project_status, d.year_started, d.year_completed,
       d.floor_area_value, d.floor_area_unit, d.site_area_value, d.site_area_unit,
       d.units_count, d.storeys_count, d.parking_spaces, d.construction_budget,
       d.scope_of_work, d.scope_of_work_zh, d.key_features, d.key_features_zh,
       d.design_architect, d.architect_of_record, d.interior_designer,
       d.landscape_architect, d.structural_engineer, d.mechanical_engineer,
       d.electrical_engineer, d.civil_engineer, d.other_consultants,
       d.general_contractor, d.developer_owner_client, d.photographer,
       d.other_credits,
       d.awards, d.publications,
       d.image_prefix, d.expected_gallery_count,
       d.created_at, d.updated_at
from public.portfolio_details d
join public.content_items ci
  on ci.id = d.content_id and ci.status = 'published';

-- ---- media for published items ----------------------------------------------
create or replace view public.public_media_assets as
select m.id, m.client_id, m.content_id, m.file_url, m.file_type,
       m.alt_text, m.alt_text_zh, m.caption, m.caption_zh, m.image_credit,
       m.width_px, m.height_px, m.is_featured, m.sort_order
from public.media_assets m
join public.content_items ci
  on ci.id = m.content_id and ci.status = 'published';

-- ---- taxonomy ----------------------------------------------------------------
create or replace view public.public_categories as
select id, client_id, category_type, name, name_zh, slug, sort_order
from public.categories;

create or replace view public.public_tags as
select id, client_id, category_id, parent_tag_id, tag_level,
       name, name_zh, slug, sort_order
from public.tags;

create or replace view public.public_content_categories as
select cc.id, cc.content_id, cc.category_id
from public.content_categories cc
join public.content_items ci
  on ci.id = cc.content_id and ci.status = 'published';

create or replace view public.public_content_tags as
select ct.id, ct.content_id, ct.tag_id
from public.content_tags ct
join public.content_items ci
  on ci.id = ct.content_id and ci.status = 'published';

-- ---- read-only grants (SELECT only, no INSERT/UPDATE/DELETE) -----------------
grant usage on schema public to anon;
grant select on
  public.public_clients,
  public.public_content_items,
  public.public_portfolio_details,
  public.public_media_assets,
  public.public_categories,
  public.public_tags,
  public.public_content_categories,
  public.public_content_tags
to anon, authenticated;

commit;

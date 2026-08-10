-- Architect 57 — Portfolio Credit definitions update (newest master spreadsheet)
-- Run in the external CMS Supabase project's SQL editor.
--
-- NO schema changes. NO RLS changes. NO project data changes.
-- Only public.portfolio_field_definitions rows for client "Architect 57"
-- (id e0c9e6c4-9196-4a2a-acd3-09c23ea0935d) are touched.
--
-- Renamed roles keep their existing field_key (values in
-- portfolio_details.additional_project_data.credits stay intact); only
-- label_en, source_columns (accepted spreadsheet headers) and display_order
-- change. Chinese labels are preserved as-is.

begin;

-- 1) Original Design Architect or Engineer (order 10) — unchanged label
update public.portfolio_field_definitions
   set display_order = 10,
       source_columns = array['Original Design Architect or Engineer']
 where client_id = 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d'
   and content_type = 'portfolio' and section = 'credits'
   and field_key = 'original_design_architect_or_engineer';

-- 2) Architect of Record / BP Architect (order 20) — unchanged label
update public.portfolio_field_definitions
   set display_order = 20,
       source_columns = array['Architect of Record / BP Architect']
 where client_id = 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d'
   and content_type = 'portfolio' and section = 'credits'
   and field_key = 'architect_of_record';

-- 3) NEW — Subsequent Architect of Record / BP Architect (order 30, JSONB only)
insert into public.portfolio_field_definitions
  (scope_type, industry, client_id, content_type, section, field_key,
   label_en, label_zh, field_type, source_columns, display_order,
   is_required, show_in_cms, show_on_frontend, is_active, settings)
select 'client', null, 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d', 'portfolio', 'credits',
       'subsequent_architect_of_record',
       'Subsequent Architect of Record / BP Architect',
       '後續建築許可建築師',
       'text',
       array['Subsequent Architect of Record / BP Architect'],
       30, false, true, true, true, '{}'::jsonb
where not exists (
  select 1 from public.portfolio_field_definitions
   where client_id = 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d'
     and content_type = 'portfolio' and section = 'credits'
     and field_key = 'subsequent_architect_of_record'
);

-- 4) RENAME — Interior Designer -> Designer or Interior Designer (order 40)
update public.portfolio_field_definitions
   set label_en = 'Designer or Interior Designer',
       display_order = 40,
       source_columns = array['Designer or Interior Designer', 'Interior Designer']
 where client_id = 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d'
   and content_type = 'portfolio' and section = 'credits'
   and field_key = 'interior_designer';

-- 5) NEW — Rendering or Photo Credit (order 50, JSONB only)
insert into public.portfolio_field_definitions
  (scope_type, industry, client_id, content_type, section, field_key,
   label_en, label_zh, field_type, source_columns, display_order,
   is_required, show_in_cms, show_on_frontend, is_active, settings)
select 'client', null, 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d', 'portfolio', 'credits',
       'rendering_or_photo_credit',
       'Rendering or Photo Credit',
       '效果圖／照片來源',
       'text',
       array['Rendering or Photo Credit'],
       50, false, true, true, true, '{}'::jsonb
where not exists (
  select 1 from public.portfolio_field_definitions
   where client_id = 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d'
     and content_type = 'portfolio' and section = 'credits'
     and field_key = 'rendering_or_photo_credit'
);

-- 6) RENAME — Code Consultant -> Building Code Consultant (order 60)
update public.portfolio_field_definitions
   set label_en = 'Building Code Consultant',
       display_order = 60,
       source_columns = array['Building Code Consultant', 'Code Consultant']
 where client_id = 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d'
   and content_type = 'portfolio' and section = 'credits'
   and field_key = 'code_consultant';

-- 7) RENAME — Envelope Consultant -> Building Envelope Consultant (order 70)
update public.portfolio_field_definitions
   set label_en = 'Building Envelope Consultant',
       display_order = 70,
       source_columns = array['Building Envelope Consultant', 'Envelope Consultant']
 where client_id = 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d'
   and content_type = 'portfolio' and section = 'credits'
   and field_key = 'envelope_consultant';

-- 8) Awards / Recognition (order 80) — unchanged label
update public.portfolio_field_definitions
   set display_order = 80,
       source_columns = array['Awards / Recognition']
 where client_id = 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d'
   and content_type = 'portfolio' and section = 'credits'
   and field_key = 'awards_recognition';

commit;

-- Verification
-- select field_key, label_en, label_zh, display_order, source_columns
--   from public.portfolio_field_definitions
--  where client_id = 'e0c9e6c4-9196-4a2a-acd3-09c23ea0935d'
--    and section = 'credits' order by display_order;

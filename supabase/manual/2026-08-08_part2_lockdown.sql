-- PART 2 — LOCKDOWN. **BREAKING unless CMS admins sign in first.**
--
-- Today the BluLuma CMS admin app talks to Supabase as the `anon` role
-- (no login gate). This script removes anon write access, so before running it
-- the admin app must require a Supabase login (Part 3 in the app code).
--
-- After this script:
--   anon         -> can read ONLY the public_* views from Part 1. No writes anywhere.
--   authenticated-> full read/write on the CMS tables (admin app, once logged in).
--   service_role -> unchanged, full access.
--
-- Run in the SQL editor of the CMS Supabase project (uzdjwpkgldzhnoxjeyrw).

begin;

do $$
declare t text;
begin
  foreach t in array array[
    'clients','content_items','portfolio_details','categories',
    'content_categories','tags','content_tags','media_assets'
  ]
  loop
    -- 1. remove ALL anon privileges on the base tables (read now goes via views)
    execute format('revoke all on public.%I from anon', t);

    -- 2. make sure the admin role and server role keep working
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    -- 3. turn RLS on (additive: existing policies, if any, are left in place)
    execute format('alter table public.%I enable row level security', t);

    -- 4. an authenticated-only full-access policy so the CMS admin keeps working.
    --    Named distinctly so it cannot collide with / replace an existing policy.
    execute format(
      'create policy "bluluma_admin_full_access_%s" on public.%I
         for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

commit;

-- Note: no policy is created for `anon` on any base table. With RLS enabled and
-- no anon policy + no anon grant, anon has zero base-table access — published
-- content is served exclusively through the Part 1 public_* views.

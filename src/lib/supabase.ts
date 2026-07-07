import { createClient } from "@supabase/supabase-js";

// Pinned to the external Supabase project that holds the live CMS data
// (clients, content_items, portfolio_details, categories, tags, media_assets).
// Do NOT change without coordinating a data migration.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL_OVERRIDE ?? "https://uzdjwpkgldzhnoxjeyrw.supabase.co";
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY_OVERRIDE ??
  "sb_publishable_ifsg2zxajGqu19GsJ2X4RQ_KHBHGIvi";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "bluluma.cms.auth",
  },
});

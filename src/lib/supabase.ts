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
    // Auth can consume the recovery hash before React mounts its root listener.
    // Capture recovery intent during URL detection, then still validate the user.
    detectSessionInUrl: (_url, params) => {
      if (typeof window !== "undefined" && window.location.pathname === "/reset-password" && params.type === "recovery") {
        window.sessionStorage.setItem("bluluma.cms.recovery", "true");
      }
      return Boolean(params.access_token || params.error_description);
    },
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "bluluma.cms.auth",
  },
});

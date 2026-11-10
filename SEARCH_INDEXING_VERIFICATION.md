# Domain-aware search indexing verification

## Inspection

- Existing project: TanStack Start, Vite, Lovable publishing integration, Cloudflare-compatible server entry.
- Normal publishing uses request-time SSR; no TanStack static prerender is enabled.
- The separate `build:static` script exports one shared HTML document and `_redirects` for SPA fallback.
- Existing root HTML had unconditional `noindex, nofollow, noarchive`. It has been removed to prevent custom-domain restrictions.
- Existing leaf titles and descriptions remain unchanged. No canonical URLs, robots.txt or sitemap.xml were present; none were invented.
- The connected-domain check confirmed the project is published with **no connected custom domains**.

## Implementation

- Only incoming URL hostnames ending in `.lovable.app`, `.workers.dev`, `.pages.dev` or `.netlify.app` receive `X-Robots-Tag: noindex` on HTML/XHTML responses.
- Dot-delimited suffix matching supports nested hostnames and previews, normalizes case/trailing DNS dots, and rejects lookalikes. Forwarded-host headers are not trusted.
- TanStack request middleware covers ordinary SSR responses. The existing server wrapper also covers catastrophic error HTML.
- Netlify edge middleware is registered for `/*` in `netlify.toml`, including the static SPA fallback.
- Cloudflare Pages `functions/_middleware.ts` covers Pages responses, including static fallbacks, when deployed with Pages Functions enabled.
- Custom-domain responses and non-HTML resources pass through unchanged. Existing independent restrictive headers are preserved, not erased.
- No blocking robots.txt, redirects, login changes, visual changes, database changes or dependencies were added.

## Verification and limits

- **Public HTTP inspected:** `https://bluluma-content-hub.lovable.app/`, `/auth`, `/portfolio/new` returned 200 HTML with neither a robots meta tag nor X-Robots-Tag before these edits. `/robots.txt` and `/sitemap.xml` returned 404. The published version is currently **not confirmed protected**.
- **Public preview inspected:** `https://id-preview--1511926f-f1ae-460f-9276-6a93c0c5b7fd.lovable.app` returned platform-managed 401 text with `X-Robots-Tag: noindex, nofollow`. This does **not** verify public app HTML. This project cannot alter Lovable's editor-preview access gate; use a shared preview link for guest access.
- **Local HTTP:** existing CMS routes return 200 without shared robots restrictions. Vite rejects simulated external Host headers with its own 403 before the application, so those requests do not verify deployed hostname handling.
- **Code tests:** platform suffixes, nested paths, 200/404/500 HTML, custom-host preservation, forwarded-host rejection, non-HTML pass-through, static serving adapters and idempotency are covered.
- **Build:** use the latest automated build status; no manual build was run.
- **Not verified publicly:** Workers, Pages, Netlify, or custom-domain deployments; no actual URLs for these are connected. Synthetic `.invalid` hosts in tests are not claimed to be real production domains.

## Deployment required

Publish changes in Lovable and recheck GET responses for `/`, `/auth`, `/portfolio/new`, another nested route and an unknown path. Platform HTML must include `X-Robots-Tag: noindex`; custom-domain HTML must not inherit it. Confirm status, redirects and the initial HTML, not only client-rendered metadata.

For a Netlify static export, redeploy the static output **and** the committed Netlify edge function/configuration from this repository. For Cloudflare Pages, deploy the static output **and** the committed Pages Functions directory. Uploading only `dist/` to either provider omits request-time protection; do not claim such an upload is protected.

Lovable can place hosting-owned responses, access gates or asset handling in front of the app. Application middleware cannot enforce headers on responses that bypass the application. The current non-prerendered app HTML is handled by request-time middleware, but actual Lovable platform coverage remains unverified until republishing and inspecting public responses. If a hosting-owned HTML response bypasses it, protection for that response requires a conditional rule at that hosting layer; adding all-host static headers or global noindex would incorrectly restrict custom domains and is not an acceptable fallback.
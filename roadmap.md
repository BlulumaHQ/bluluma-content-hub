# Domain-aware search indexing

- [x] Inspect framework, publishing, current SEO and connected domains.
- [x] Replace unconditional shared noindex with request-host HTML headers.
- [x] Add static-host serving adapters for Netlify and Cloudflare Pages.
- [x] Verify hostname rules, static adapters and unchanged local route access.
- [ ] Verify deployed platform headers and custom-domain eligibility after redeployment. Blocker: unpublished changes; no custom domains or Workers/Pages/Netlify deployment URLs connected.

# Portfolio editor update
- [x] Add website selections and services checklist; preserve the client-name database column.
- [x] Add version list and screenshot-only gallery editing.
- [x] Add Inbox/Published rows with categories, website badges, and publishing.
- [x] Test portfolio rules and verify saving, captions, ordering, screenshot deletion, and publishing with disposable records; all test records removed.
- [ ] Enable version deletion for the current database role. Blocker: existing database permissions deny DELETE on portfolio_versions; no permissions changed in this request.

# CMS email login
- [x] Add email-only sign-in/signup, existing is_admin authorization, persistent route protection, header sign-out, and password recovery without database or permission changes.
- [x] Test authorization and password rules; verify available browser flows and report external-account verification limitations.
- [ ] Verify real administrator sign-in and delivered recovery emails. Blocker: existing external backend accounts cannot be minted or inspected through this project's managed backend; simulated-account checks only.
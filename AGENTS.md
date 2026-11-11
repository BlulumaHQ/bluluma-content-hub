# Project rules

- Apply indexing restrictions at request time through the shared hostname policy in server and static-host middleware; never bake platform noindex into shared HTML, so custom domains remain index-eligible.
- Keep Portfolio editor defaults separate from importer defaults so new editor selections do not alter bulk import behavior.
- Share versions and screenshot editing across Portfolio editor surfaces; scope screenshots by content, client, and file type so unrelated media and featured-image storage stay intact.
- Keep CMS content beneath the client-only `_cms` pathless route and authorize through the existing external client getUser/is_admin RPC; this preserves URLs and keeps CMS accounts separate from managed Cloud sessions.
- Use one per-router auth controller and one root subscription, and cancel/clear queries before logout; UI route protection does not replace the database permissions the user manages separately.

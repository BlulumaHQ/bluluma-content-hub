# Portfolio editor update

## Scope
Update Portfolio only, using the existing client and existing tables. The database already has `show_on`, `portfolio_versions`, and the requested screenshot types. No schema, permissions, importer, or other content-type changes.

## Editor
- Add Show on checkboxes for BluLuma, SonyKun, and SwiftLift, saved as `bluluma`, `sonykun`, and `swiftlift`.
- Replace Services tags with the five requested checkboxes and a custom-service input. New items select all five; existing items retain their saved selections.
- Remove any Client name editor input without deleting or overwriting its stored column.
- Show Versions in saved order, with label, safe new-tab URL, thumbnail, and confirmed deletion.
- Add Gallery restricted to page and mobile screenshots, with captions, drag ordering, and confirmed deletion.
- Preserve featured-image editing and the existing non-screenshot project images separately, so screenshot ordering cannot alter other gallery images.

## List
- Add Inbox and Published tabs filtered by draft and published status.
- Render compact rows with featured thumbnail, title, assigned categories, website badges, edit/delete controls, and one-click Publish for drafts.
- Preserve client isolation and existing ordering tools. Tab changes do not silently discard unsaved ordering.

## Technical details
- Extend the Portfolio form/payload only; constrain reads and writes to portfolio items and the selected client.
- Share versions/screenshot controls between the full editor and the list's edit dialog.
- Keep existing featured-image ownership safeguards; refresh list/detail caches after changes.
- Use existing UI and drag-and-drop components; add no dependencies.
- Add focused tests for exact website values, default services, existing selections, screenshot filtering, status filtering, and scoped publishing. Check the preview with real existing records; do not publish or delete real items merely for testing.
# Project rules

- Apply indexing restrictions at request time through the shared hostname policy in server and static-host middleware; never bake platform noindex into shared HTML, so custom domains remain index-eligible.
- Keep Portfolio editor defaults separate from importer defaults so new editor selections do not alter bulk import behavior.
- Share versions and screenshot editing across Portfolio editor surfaces; scope screenshots by content, client, and file type so unrelated media and featured-image storage stay intact.
import { applySearchIndexingPolicy } from "../src/lib/search-indexing";

// Cloudflare Pages runs this for static files and SPA fallbacks, at every path.
export async function onRequest(context: { request: Request; next: () => Promise<Response> }) {
  return applySearchIndexingPolicy(context.request, await context.next());
}
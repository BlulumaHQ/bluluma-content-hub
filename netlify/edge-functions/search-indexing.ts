import { applySearchIndexingPolicy } from "../../src/lib/search-indexing";

export default async function handler(request: Request, context: { next: () => Promise<Response> }) {
  return applySearchIndexingPolicy(request, await context.next());
}
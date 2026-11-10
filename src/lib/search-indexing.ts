const platformSuffixes = [".lovable.app", ".workers.dev", ".pages.dev", ".netlify.app"];

export function isPlatformHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return platformSuffixes.some((suffix) => normalized.endsWith(suffix));
}

/** Apply only at request time; static HTML stays index-eligible on custom domains. */
export function applySearchIndexingPolicy(request: Request, response: Response): Response {
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!isPlatformHostname(new URL(request.url).hostname) ||
      (type !== "text/html" && type !== "application/xhtml+xml")) return response;

  const headers = new Headers(response.headers);
  // Keep any existing restrictive directives while adding the required noindex.
  const existing = headers.get("X-Robots-Tag");
  if (existing && /\bnoindex\b/i.test(existing)) return response;
  headers.set("X-Robots-Tag", existing ? `${existing}, noindex` : "noindex");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
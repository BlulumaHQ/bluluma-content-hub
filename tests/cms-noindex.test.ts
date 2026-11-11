import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { applySearchIndexingPolicy, isPlatformHostname } from "../src/lib/search-indexing";
import netlifyHandler from "../netlify/edge-functions/search-indexing";
import { onRequest as pagesHandler } from "../functions/_middleware";

describe("CMS search indexing protection", () => {
  it("does not bake platform noindex into shared HTML for any CMS route", async () => {
    const files = await readdir("src/routes");
    const paths = new Set<string>();
    for (const file of files.filter((name) => name.endsWith(".tsx"))) {
      const source = await readFile(`src/routes/${file}`, "utf8");
      const path = source.match(/createFileRoute\("([^"]+)"\)/)?.[1];
      if (path && path !== "/_cms") paths.add(path.replace(/^\/_cms/, "").replace(/\$\w+/g, "00000000-0000-0000-0000-000000000000"));
    }
    expect(paths.size).toBeGreaterThan(0);
    for (const path of paths) {
      const response = await fetch(`http://localhost:8080${path}`);
      expect(response.status).toBe(200);
      const html = await response.text();
      const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
      const robots = head.match(/<meta\b[^>]*name="robots"[^>]*>/gi) ?? [];
      expect(robots.length).toBe(0);
      expect(response.headers.get("x-robots-tag")).toBeNull();
    }
  });

  for (const suffix of ["lovable.app", "workers.dev", "pages.dev", "netlify.app"]) {
    it(`adds noindex to every HTML path under *.${suffix}, without blocking access`, async () => {
      for (const prefix of ["test", "preview.nested"]) {
        for (const path of ["/", "/auth", "/portfolio/new", "/missing"]) {
          for (const status of [200, 404, 500]) {
            const request = new Request(`https://${prefix}.${suffix}${path}`);
            const response = applySearchIndexingPolicy(request, new Response("<html>CMS</html>", {
              status, headers: { "content-type": "text/html; charset=utf-8" },
            }));
            expect(response.headers.get("x-robots-tag")).toContain("noindex");
            expect(response.status).toBe(status);
            expect(response.headers.get("location")).toBeNull();
            expect(await response.text()).toBe("<html>CMS</html>");
          }
        }
      }
    });
  }

  it("leaves custom-domain HTML and its existing indexing policies untouched", () => {
    for (const host of ["custom.invalid", "www.custom.invalid", "lovable.app.custom.invalid", "notlovable.app", "localhost"]) {
      const response = new Response("<html>CMS</html>", { headers: {
        "content-type": "text/html", "x-robots-tag": "index, follow", "link": '</existing>; rel="canonical"',
      } });
      const result = applySearchIndexingPolicy(new Request(`https://${host}/nested`), response);
      expect(result).toBe(response);
      expect(result.headers.get("x-robots-tag")).toBe("index, follow");
      expect(result.headers.get("link")).toBe('</existing>; rel="canonical"');
    }
    const eligible = new Response("<html>CMS</html>", { headers: { "content-type": "text/html" } });
    expect(applySearchIndexingPolicy(new Request("https://custom.invalid/"), eligible).headers.get("x-robots-tag")).toBeNull();
  });

  it("normalizes hostname case and trailing DNS dots without accepting suffix lookalikes", () => {
    expect(isPlatformHostname("PREVIEW.NESTED.LOVABLE.APP.")).toBe(true);
    expect(isPlatformHostname("lovable.app")).toBe(false);
    expect(isPlatformHostname("test.netlify.app.evil.invalid")).toBe(false);
  });

  it("does not trust forwarded host headers or alter non-HTML resources", () => {
    const html = new Response("CMS", { headers: { "content-type": "text/html" } });
    const request = new Request("https://custom.invalid/", { headers: { "x-forwarded-host": "test.lovable.app" } });
    expect(applySearchIndexingPolicy(request, html)).toBe(html);
    for (const type of ["application/json", "text/plain", "text/css", "image/png"]) {
      const resource = new Response("resource", { headers: { "content-type": type } });
      expect(applySearchIndexingPolicy(new Request("https://test.lovable.app/robots.txt"), resource)).toBe(resource);
    }
  });

  it("protects static SPA fallbacks through both serving adapters, without restricting custom domains", async () => {
    for (const host of ["test.netlify.app", "test.pages.dev", "custom.invalid"]) {
      const request = new Request(`https://${host}/portfolio/nested`);
      const next = async () => new Response("<html>static fallback</html>", { headers: { "content-type": "text/html" } });
      for (const result of [await netlifyHandler(request, { next }), await pagesHandler({ request, next })]) {
        expect(result.status).toBe(200);
        expect(result.headers.get("x-robots-tag")).toBe(host === "custom.invalid" ? null : "noindex");
        expect(await result.text()).toBe("<html>static fallback</html>");
      }
    }
  });

  it("preserves existing restrictive directives and is idempotent across middleware layers", () => {
    const request = new Request("https://test.lovable.app/");
    const response = new Response("CMS", { headers: { "content-type": "text/html", "x-robots-tag": "noarchive" } });
    const once = applySearchIndexingPolicy(request, response);
    expect(once.headers.get("x-robots-tag")).toBe("noarchive, noindex");
    expect(applySearchIndexingPolicy(request, once)).toBe(once);
  });
});
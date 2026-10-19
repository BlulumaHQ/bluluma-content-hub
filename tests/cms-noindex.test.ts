import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";

describe("CMS search indexing protection", () => {
  it("serves exactly one noindex, nofollow, noarchive directive in initial HTML for every CMS route", async () => {
    const files = await readdir("src/routes");
    const paths = new Set<string>();
    for (const file of files.filter((name) => name.endsWith(".tsx"))) {
      const source = await readFile(`src/routes/${file}`, "utf8");
      const path = source.match(/createFileRoute\("([^"]+)"\)/)?.[1];
      if (path) paths.add(path.replace(/\$\w+/g, "00000000-0000-0000-0000-000000000000"));
    }
    expect(paths.size).toBeGreaterThan(0);
    for (const path of paths) {
      const response = await fetch(`http://localhost:8080${path}`);
      expect(response.status).toBe(200);
      const html = await response.text();
      const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
      const robots = head.match(/<meta\b[^>]*name="robots"[^>]*>/gi) ?? [];
      expect(robots.length).toBe(1);
      expect(robots[0]?.match(/content="([^"]+)"/)?.[1]).toBe("noindex, nofollow, noarchive");
    }
  });
});
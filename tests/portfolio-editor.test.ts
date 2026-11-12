import { describe, expect, it } from "bun:test";
import { PORTFOLIO_WEBSITES, DEFAULT_PORTFOLIO_SERVICES, SCREENSHOT_TYPES, toggleSelection, addCustomService, filterPortfolioTab, safeWebsiteUrl } from "@/lib/portfolio-editor";
import { newPortfolioEditorForm, emptyPortfolioForm, portfolioFormFrom, buildContentPayload, buildDetailsPayload } from "@/lib/portfolio";
import { publishPortfolioItem, updateScreenshot } from "@/lib/portfolio-screenshots";
import type { PortfolioItem } from "@/types";

function fakeClient(error: { message: string } | null = null) {
  const calls: [string, ...unknown[]][] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of ["from", "select", "update", "eq", "in"]) chain[name] = (...args) => { calls.push([name, ...args]); return chain; };
  chain.single = async () => ({ data: error ? null : { id: "item" }, error });
  return { client: chain as unknown as Parameters<typeof publishPortfolioItem>[2], calls };
}

describe("Portfolio editor rules", () => {
  it("stores the three exact website values as a text array", () => {
    expect(PORTFOLIO_WEBSITES.map((w) => w.value)).toEqual(["bluluma", "sonykun", "swiftlift"]);
    const form = newPortfolioEditorForm();
    form.show_on = ["bluluma", "sonykun", "swiftlift"];
    expect(buildContentPayload(form).show_on).toEqual(["bluluma", "sonykun", "swiftlift"]);
  });
  it("new editor items have all five services checked without changing importer defaults", () => {
    expect(newPortfolioEditorForm().services).toEqual(["Website Design", "Logo Design", "Branding", "Marketing Materials", "SEO"]);
    expect(emptyPortfolioForm().services).toEqual([]);
    expect(DEFAULT_PORTFOLIO_SERVICES).toHaveLength(5);
  });
  it("existing empty service and website selections remain empty", () => {
    const form = portfolioFormFrom({ title: "Existing", slug: "existing", status: "draft", show_on: [], portfolio_details: { services: [] } } as unknown as PortfolioItem);
    expect(form.services).toEqual([]);
    expect(form.show_on).toEqual([]);
  });
  it("custom services are trimmed, checked, and deduplicated", () => {
    expect(addCustomService(["SEO"], " Photography ")).toEqual(["SEO", "Photography"]);
    expect(addCustomService(["SEO"], "seo")).toEqual(["SEO"]);
    expect(toggleSelection(["SEO", "Branding"], "SEO", false)).toEqual(["Branding"]);
    expect(buildDetailsPayload({ ...newPortfolioEditorForm(), services: ["Photography"] }).services).toEqual(["Photography"]);
  });
  it("does not overwrite the retained client_name column", () => {
    expect(buildDetailsPayload(newPortfolioEditorForm(), { preserveClientName: true })).not.toHaveProperty("client_name");
    expect(buildDetailsPayload({ ...emptyPortfolioForm(), title: "Importer title" }).client_name).toBe("Importer title");
  });
  it("Inbox includes only draft portfolios", () => {
    expect(filterPortfolioTab([{ content_type: "portfolio", status: "draft" }, { content_type: "blog", status: "draft" }, { content_type: "portfolio", status: "published" }], "draft")).toEqual([{ content_type: "portfolio", status: "draft" }]);
  });
  it("Published includes only published portfolios", () => {
    expect(filterPortfolioTab([{ content_type: "portfolio", status: "archived" }, { content_type: "portfolio", status: "published" }], "published")).toEqual([{ content_type: "portfolio", status: "published" }]);
  });
  it("publishing scopes the update to one client's draft portfolio", async () => {
    const { client, calls } = fakeClient();
    await publishPortfolioItem("p1", "c1", client);
    expect(calls).toContainEqual(["eq", "id", "p1"]);
    expect(calls).toContainEqual(["eq", "client_id", "c1"]);
    expect(calls).toContainEqual(["eq", "content_type", "portfolio"]);
    expect(calls).toContainEqual(["eq", "status", "draft"]);
    expect((calls.find(([name]) => name === "update")?.[1] as { status: string }).status).toBe("published");
  });
  it("screenshot writes are restricted to the requested types and item", async () => {
    const { client, calls } = fakeClient();
    await updateScreenshot("p1", "c1", "a1", { caption: "Home", sort_order: 2 }, client);
    expect(SCREENSHOT_TYPES).toEqual(["page_screenshot", "mobile_screenshot"]);
    expect(calls).toContainEqual(["in", "file_type", ["page_screenshot", "mobile_screenshot"]]);
    expect(calls).toContainEqual(["eq", "content_id", "p1"]);
    expect(calls).toContainEqual(["update", { caption: "Home", sort_order: 2 }]);
  });
  it("failed writes never report success", async () => {
    const { client } = fakeClient({ message: "Write denied" });
    await expect(publishPortfolioItem("p1", "c1", client)).rejects.toThrow("Write denied");
  });
  it("version links allow only http and https", () => {
    expect(safeWebsiteUrl("https://example.com/version")).toBe("https://example.com/version");
    expect(safeWebsiteUrl("javascript:alert(1)")).toBeNull();
  });
});
import { togglePendingFeatured, splitFeaturedChanges, countFeatured } from "@/lib/portfolio-editor";
describe("featured quick toggle", () => {
  it("toggling twice clears the pending change", () => {
    const a = togglePendingFeatured(new Map(), "x", false);
    expect(a.get("x")).toBe(true);
    expect(togglePendingFeatured(a, "x", false).size).toBe(0);
  });
  it("splits into featured and unfeatured batches", () => {
    expect(splitFeaturedChanges(new Map([["a", true], ["b", false], ["c", true]]))).toEqual({ on: ["a", "c"], off: ["b"] });
  });
  it("counts saved plus pending state", () => {
    const items = [{ id: "a", is_featured: true }, { id: "b", is_featured: false }, { id: "c", is_featured: true }];
    expect(countFeatured(items, new Map([["b", true], ["c", false]]))).toBe(2);
  });
});

describe("bulk featured", () => {
  it("marks many as pending featured and drops entries already in that state", async () => {
    const { setPendingFeaturedMany } = await import("@/lib/portfolio-editor");
    const items = [{ id: "a", is_featured: false }, { id: "b", is_featured: true }, { id: "c", is_featured: false }];
    const on = setPendingFeaturedMany(new Map([["b", false]]), items, ["a", "b", "x"], true);
    expect([...on]).toEqual([["a", true]]);
    const off = setPendingFeaturedMany(on, items, ["a", "c"], false);
    expect(off.size).toBe(0);
  });
});

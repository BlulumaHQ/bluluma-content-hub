import { describe, expect, it } from "bun:test";
import { applyShowOn, showOnAfterPublish } from "@/lib/portfolio-editor";
import { bulkSetStatus, publishWithDefaultSite } from "@/lib/portfolio-screenshots";

function fake(rows: number) {
  const calls: unknown[][] = [];
  const chain: Record<string, (...a: unknown[]) => unknown> = {};
  for (const n of ["from", "update", "eq", "in"]) chain[n] = (...a) => { calls.push([n, ...a]); return chain; };
  chain.select = (...a) => { calls.push(["select", ...a]); return Object.assign(Promise.resolve({ data: Array(rows).fill({ id: "x" }), error: null }), chain); };
  chain.single = async () => ({ data: { id: "x" }, error: null });
  return { client: chain as never, calls };
}

describe("Portfolio bulk actions", () => {
  it("Add mode keeps existing websites", () => expect(applyShowOn(["bluluma"], ["sonykun"], "add")).toEqual(["bluluma", "sonykun"]));
  it("Remove mode removes only picked websites", () => expect(applyShowOn(["bluluma", "sonykun"], ["sonykun"], "remove")).toEqual(["bluluma"]));
  it("Set mode uses exactly the checked websites", () => expect(applyShowOn(["bluluma"], ["swiftlift"], "set")).toEqual(["swiftlift"]));
  it("publishing with no websites defaults to BluLuma", () => {
    expect(showOnAfterPublish([])).toEqual(["bluluma"]);
    expect(showOnAfterPublish(["sonykun"])).toEqual(["sonykun"]);
  });
  it("row publish writes bluluma when show_on is empty", async () => {
    const { client, calls } = fake(1);
    await publishWithDefaultSite({ id: "p1", show_on: [] }, "c1", client);
    expect(calls.find((c) => c[0] === "update")?.[1]).toMatchObject({ status: "published", show_on: ["bluluma"] });
  });
  it("bulk status is one batched update scoped to client portfolios", async () => {
    const { client, calls } = fake(2);
    expect(await bulkSetStatus(["a", "b"], "c1", "draft", client)).toBe(2);
    expect(calls.filter((c) => c[0] === "update")).toHaveLength(1);
    expect(calls).toContainEqual(["in", "id", ["a", "b"]]);
    expect(calls).toContainEqual(["eq", "client_id", "c1"]);
  });
  it("bulk update fails loudly when rows were not updated", async () => {
    const { client } = fake(1);
    await expect(bulkSetStatus(["a", "b"], "c1", "published", client)).rejects.toThrow();
  });
});

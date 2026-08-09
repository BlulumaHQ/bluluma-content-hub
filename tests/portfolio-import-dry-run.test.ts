import { describe, expect, it } from "bun:test";
import {
  buildImportMapping,
  importDynamicSaveInput,
  imagePrefixLooksRelated,
  mapRow,
  resolveSlug,
} from "@/lib/portfolio-import-mapping";
import { validateImport } from "@/lib/portfolio-import-validation";
import {
  buildLegacyOverrides,
  mergeAdditionalProjectData,
  type PortfolioFieldDefinition,
} from "@/lib/field-definitions";

const def = (o: Partial<PortfolioFieldDefinition>): PortfolioFieldDefinition => ({
  id: o.field_key ?? "id",
  scope_type: "client",
  industry: null,
  client_id: "c1",
  content_type: "portfolio",
  section: "specifications",
  field_key: "x",
  label_en: "X",
  label_zh: null,
  field_type: "text",
  source_columns: [],
  display_order: 0,
  is_required: false,
  show_in_cms: true,
  show_on_frontend: true,
  is_active: true,
  settings: null,
  ...o,
});

const DEFS = [
  def({
    field_key: "floor_area",
    label_en: "Floor Area",
    field_type: "measurement",
    source_columns: ["Floor Area", "Area Unit"],
    settings: { legacy_value_column: "floor_area_value", legacy_unit_column: "floor_area_unit" },
  }),
  def({
    section: "credits",
    field_key: "architect_of_record",
    label_en: "Architect of Record",
    source_columns: ["Architect of Record / BP Architect"],
    settings: { legacy_column: "architect_of_record" },
  }),
  def({ section: "credits", field_key: "code_consultant", label_en: "Code Consultant", source_columns: ["Code Consultant"] }),
  def({ section: "credits", field_key: "envelope_consultant", label_en: "Envelope Consultant", source_columns: ["Envelope Consultant"] }),
  def({
    field_key: "construction_budget",
    label_en: "Construction Budget",
    field_type: "currency",
    source_columns: ["Construction Budget (CAD)", "Budget Display Text"],
    settings: { legacy_column: "construction_budget", currency: "CAD" },
  }),
];

const HEADERS = [
  "Project Name (EN)",
  "slug",
  "Category",
  "Tag 1",
  "Tag 2",
  "Floor Area",
  "Area Unit",
  "Architect of Record / BP Architect",
  "Code Consultant",
  "Envelope Consultant",
  "Construction Budget (CAD)",
  "Budget Display Text",
  "Notes for Sony",
  "Original detail text (ref.)",
];

const row = (over: Record<string, string> = {}) => HEADERS.map((h) => over[h] ?? "");

const run = (rows: string[][], headers = HEADERS, strict = true, existing: string[] = []) =>
  validateImport({
    headers,
    dataRows: rows,
    definitions: DEFS,
    existingSlugs: new Set(existing),
    strict,
  });

const mapping = buildImportMapping(HEADERS, DEFS);

describe("A-D dynamic mapping", () => {
  const mapped = mapRow(
    row({
      "Project Name (EN)": "Tower",
      slug: "tower",
      "Floor Area": "4,800",
      "Area Unit": "sq ft",
      "Architect of Record / BP Architect": "ACME",
      "Code Consultant": "CodeCo",
      "Envelope Consultant": "EnvCo",
      "Construction Budget (CAD)": "1780000",
      "Budget Display Text": "$1.78 millions",
    }),
    mapping,
  );

  it("A: measurement value + unit collapse into one JSON field", () => {
    const json = mergeAdditionalProjectData({}, mapped.populatedDefinitions, mapped.dynamic);
    expect((json.specifications as Record<string, unknown>).floor_area).toEqual({
      value: 4800,
      unit: "sq ft",
    });
  });

  it("B: mapped credit dual-writes its legacy column", () => {
    const legacy = buildLegacyOverrides(mapped.populatedDefinitions, mapped.dynamic);
    expect(legacy.floor_area_value).toBe(4800);
    expect(legacy.floor_area_unit).toBe("sq ft");
    expect(legacy.architect_of_record).toBe("ACME");
  });

  it("C+D: JSON-only credits never invent a column", () => {
    const json = mergeAdditionalProjectData({}, mapped.populatedDefinitions, mapped.dynamic);
    const credits = json.credits as Record<string, unknown>;
    expect(credits.code_consultant).toBe("CodeCo");
    expect(credits.envelope_consultant).toBe("EnvCo");
    const legacy = buildLegacyOverrides(mapped.populatedDefinitions, mapped.dynamic);
    expect(legacy.code_consultant).toBeUndefined();
    expect(legacy.envelope_consultant).toBeUndefined();
  });

  it("keeps the numeric budget next to the display text", () => {
    const json = mergeAdditionalProjectData({}, mapped.populatedDefinitions, mapped.dynamic);
    expect((json.specifications as Record<string, unknown>).construction_budget).toEqual({
      value: 1780000,
      currency: "CAD",
      display: "$1.78 millions",
    });
  });

  it("merges JSONB non-destructively", () => {
    const json = mergeAdditionalProjectData(
      { other: { keep: 1 }, specifications: { untouched: "yes" } },
      mapped.populatedDefinitions,
      mapped.dynamic,
    );
    expect(json.other).toEqual({ keep: 1 });
    expect((json.specifications as Record<string, unknown>).untouched).toBe("yes");
  });
});

describe("E empty dynamic cells", () => {
  it("no errors, no blank JSON values, no legacy nulls", () => {
    const res = run([row({ "Project Name (EN)": "Blank", slug: "blank" })]);
    expect(res.totals.errors).toBe(0);
    const m = res.rows[0].mapped;
    expect(m.specificationCount).toBe(0);
    expect(m.creditCount).toBe(0);
    const input = importDynamicSaveInput(m);
    expect(mergeAdditionalProjectData({}, input.definitions, input.values)).toEqual({});
    expect(buildLegacyOverrides(input.definitions, input.values)).toEqual({});
  });
});

describe("F/G unknown columns", () => {
  const headers = [...HEADERS, "Mystery Column"];
  it("F: populated unknown column BLOCKS the import", () => {
    const res = validateImport({
      headers,
      dataRows: [[...row({ "Project Name (EN)": "T", slug: "t" }), "important value"]],
      definitions: DEFS,
      existingSlugs: new Set(),
      strict: true,
    });
    expect(res.canCommit).toBe(false);
    expect(
      res.rows[0].issues.some(
        (i) => i.severity === "error" && i.message.includes("Mystery Column"),
      ),
    ).toBe(true);
  });
  it("G: empty unknown column does not block", () => {
    const res = validateImport({
      headers,
      dataRows: [[...row({ "Project Name (EN)": "T", slug: "t" }), ""]],
      definitions: DEFS,
      existingSlugs: new Set(),
      strict: true,
    });
    expect(res.canCommit).toBe(true);
  });
  it("non-strict downgrades to a warning", () => {
    const res = validateImport({
      headers,
      dataRows: [[...row({ "Project Name (EN)": "T", slug: "t" }), "v"]],
      definitions: DEFS,
      existingSlugs: new Set(),
      strict: false,
    });
    expect(res.canCommit).toBe(true);
    expect(res.totals.warnings).toBeGreaterThan(0);
  });
});

describe("H duplicate slug", () => {
  it("blocks", () => {
    const res = run([
      row({ "Project Name (EN)": "A", slug: "dup" }),
      row({ "Project Name (EN)": "B", slug: "dup" }),
    ]);
    expect(res.canCommit).toBe(false);
  });
});

describe("I % slug", () => {
  it("keeps the display title, flags the normalized slug", () => {
    const res = run([row({ "Project Name (EN)": "%Arabica Coffee", slug: "%Arabica Coffee" })]);
    expect(res.rows[0].title).toBe("%Arabica Coffee");
    expect(res.rows[0].slug).toBe("arabica-coffee");
    expect(res.rows[0].issues.some((i) => i.severity === "warning" && i.column === "slug")).toBe(true);
    expect(res.canCommit).toBe(true);
  });
  it("derives a safe slug from a % title", () => {
    expect(resolveSlug("", "%Arabica Coffee").slug).toBe("arabica-coffee");
  });
});

describe("J non-dynamic client", () => {
  it("legacy CSV contract still fully maps with zero definitions", () => {
    const res = validateImport({
      headers: [
        "title",
        "slug",
        "category",
        "tag_1",
        "tag_2",
        "floor_area_value",
        "floor_area_unit",
        "architect_of_record",
        "internal_notes",
        "image_prefix",
      ],
      dataRows: [
        ["Legacy", "legacy", "Residential", "Single Family", "Reno", "1200", "sq ft", "ACME", "note", "legacy"],
      ],
      definitions: [],
      existingSlugs: new Set(),
      strict: true,
    });
    expect(res.mapping.unmappedColumns).toHaveLength(0);
    expect(res.canCommit).toBe(true);
    expect(res.rows[0].mapped.core.floor_area_value).toBe("1200");
  });
});

describe("misc validation", () => {
  it("flags unrelated image filenames", () => {
    expect(imagePrefixLooksRelated("sushiKiwami01v2", "arabica-coffee")).toBe(false);
    expect(imagePrefixLooksRelated("arabica-coffee", "arabica-coffee")).toBe(true);
  });
  it("internal / reference columns are mapped, not unknown", () => {
    const notes = mapping.columns.find((c) => c.header === "Notes for Sony")!;
    expect(notes.status).toBe("mapped");
    expect(notes.destination).toBe("portfolio_details.internal_notes");
    expect(mapping.columns.find((c) => c.header === "Original detail text (ref.)")!.destination).toBe(
      "portfolio_details.original_website_content",
    );
  });
  it("errors on Tag 1 without a Category", () => {
    expect(run([row({ "Project Name (EN)": "T", slug: "t", "Tag 1": "Single Family" })]).canCommit).toBe(false);
  });
  it("errors on a non-numeric measurement", () => {
    expect(run([row({ "Project Name (EN)": "T", slug: "t", "Floor Area": "big" })]).canCommit).toBe(false);
  });
  it("reports create vs update", () => {
    const res = run(
      [row({ "Project Name (EN)": "T", slug: "t" }), row({ "Project Name (EN)": "U", slug: "u" })],
      HEADERS,
      true,
      ["u"],
    );
    expect(res.totals.create).toBe(1);
    expect(res.totals.update).toBe(1);
  });
  it("import payload contains only populated definitions", () => {
    const m = mapRow(row({ "Project Name (EN)": "T", slug: "t", "Code Consultant": "CC" }), mapping);
    const input = importDynamicSaveInput(m);
    expect(input.definitions.map((d) => d.field_key)).toEqual(["code_consultant"]);
    expect(buildLegacyOverrides(input.definitions, input.values)).toEqual({});
  });
});

describe("Architect57 header fixes", () => {
  const H = ["#", "Company", "Project Name (EN)", "Project Slug (URL)"];
  const runA = (rows: string[][], existing: string[] = [], clientName = "Architect 57") =>
    validateImport({
      headers: H,
      dataRows: rows,
      definitions: [],
      existingSlugs: new Set(existing),
      strict: true,
      clientName,
    });

  it("recognizes #, Company and Project Slug (URL)", () => {
    const m = buildImportMapping(H, []);
    expect(m.unmappedColumns).toHaveLength(0);
    expect(m.columns[0].type).toBe("System");
    expect(m.columns[0].destination).toContain("Row Reference");
    expect(m.columns[1].type).toBe("Client Validation");
    expect(m.columns[3].destination).toBe("content_items.slug");
  });

  it("uses the supplied slug, not one generated from the title", () => {
    const res = runA([["1", "Architect 57", "Okanagan Chateau Retirement Residence", "okanagan-chateau"]]);
    expect(res.rows[0].slug).toBe("okanagan-chateau");
    expect(res.canCommit).toBe(true);
  });

  it("recalculates update vs create from the supplied slug", () => {
    const res = runA(
      [
        ["1", "Architect 57", "Architect 57 Inc.", "architect-57-office"],
        ["2", "Architect 57", "1NE Collective Realty", "1ne-collective"],
      ],
      ["architect-57-office"],
    );
    expect(res.totals.update).toBe(1);
    expect(res.totals.create).toBe(1);
  });

  it("blocks a company mismatch", () => {
    const res = runA([["1", "ABC Company", "T", "t"]]);
    expect(res.canCommit).toBe(false);
  });

  it("warns on an unsafe supplied slug and proposes a safe one", () => {
    const res = runA([["1", "Architect 57", "%Arabica Coffee", "%arabica-coffee"]]);
    expect(res.rows[0].title).toBe("%Arabica Coffee");
    expect(res.rows[0].slug).toBe("arabica-coffee");
    expect(res.rows[0].issues.some((i) => i.severity === "warning" && i.column === "slug")).toBe(true);
    expect(res.canCommit).toBe(true);
  });

  it("matches an existing legacy unsafe slug instead of creating a duplicate", () => {
    const res = runA([["1", "Architect 57", "%Arabica Coffee", "%arabica-coffee"]], ["%arabica-coffee"]);
    expect(res.rows[0].matchSlug).toBe("%arabica-coffee");
    expect(res.totals.update).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildImportMapping,
  importDynamicSaveInput,
  mapRow,
  resolveSlug,
  imagePrefixLooksRelated,
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
  def({
    section: "credits",
    field_key: "code_consultant",
    label_en: "Code Consultant",
    source_columns: ["Code Consultant"],
  }),
  def({
    section: "credits",
    field_key: "envelope_consultant",
    label_en: "Envelope Consultant",
    source_columns: ["Envelope Consultant"],
  }),
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

const row = (over: Record<string, string> = {}) =>
  HEADERS.map((h) => over[h] ?? "");

const run = (rows: string[][], headers = HEADERS, strict = true, existing: string[] = []) =>
  validateImport({
    headers,
    dataRows: rows,
    definitions: DEFS,
    existingSlugs: new Set(existing),
    strict,
  });

describe("A/B/C/D dynamic mapping", () => {
  const mapping = buildImportMapping(HEADERS, DEFS);
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

  it("maps measurement value + unit into one JSON field", () => {
    const json = mergeAdditionalProjectData({}, mapped.populatedDefinitions, mapped.dynamic);
    expect((json.specifications as Record<string, unknown>).floor_area).toEqual({
      value: 4800,
      unit: "sq ft",
    });
  });

  it("dual-writes mapped legacy columns", () => {
    const legacy = buildLegacyOverrides(mapped.populatedDefinitions, mapped.dynamic);
    expect(legacy.floor_area_value).toBe(4800);
    expect(legacy.floor_area_unit).toBe("sq ft");
    expect(legacy.architect_of_record).toBe("ACME");
  });

  it("keeps JSON-only credits out of the legacy payload", () => {
    const json = mergeAdditionalProjectData({}, mapped.populatedDefinitions, mapped.dynamic);
    const credits = json.credits as Record<string, unknown>;
    expect(credits.code_consultant).toBe("CodeCo");
    expect(credits.envelope_consultant).toBe("EnvCo");
    const legacy = buildLegacyOverrides(mapped.populatedDefinitions, mapped.dynamic);
    expect(legacy).not.toHaveProperty("code_consultant");
    expect(legacy).not.toHaveProperty("envelope_consultant");
  });

  it("keeps the numeric budget alongside the display text", () => {
    const json = mergeAdditionalProjectData({}, mapped.populatedDefinitions, mapped.dynamic);
    expect((json.specifications as Record<string, unknown>).construction_budget).toEqual({
      value: 1780000,
      currency: "CAD",
      display: "$1.78 millions",
    });
  });

  it("merges non-destructively", () => {
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
  it("produces no errors and no blank JSON keys", () => {
    const res = run([row({ "Project Name (EN)": "Blank", slug: "blank" })]);
    expect(res.totals.errors).toBe(0);
    const r = res.rows[0];
    expect(r.mapped.specificationCount).toBe(0);
    const json = mergeAdditionalProjectData({}, ...Object.values([
      r.mapped.populatedDefinitions,
      r.mapped.dynamic,
    ] as [PortfolioFieldDefinition[], never]) as [PortfolioFieldDefinition[], never]);
    expect(json).toEqual({});
  });
});

describe("F/G unknown columns", () => {
  const headers = [...HEADERS, "Mystery Column"];
  it("blocks the import when populated", () => {
    const res = run(
      [[...row({ "Project Name (EN)": "T", slug: "t" }), "important value"]],
      headers,
    );
    expect(res.canCommit).toBe(false);
    expect(res.rows[0].issues.some((i) => i.severity === "error" && i.message.includes("Mystery Column"))).toBe(true);
  });
  it("does not block when empty", () => {
    const res = run([[...row({ "Project Name (EN)": "T", slug: "t" }), ""]], headers);
    expect(res.canCommit).toBe(true);
  });
  it("downgrades to a warning when strict validation is off", () => {
    const res = run([[...row({ "Project Name (EN)": "T", slug: "t" }), "v"]], headers, false);
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

describe("I problematic slug", () => {
  it("keeps the display title and flags slug normalization", () => {
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

describe("J non-dynamic client (legacy contract)", () => {
  const legacyHeaders = [
    "title",
    "slug",
    "category",
    "tag_1",
    "floor_area_value",
    "floor_area_unit",
    "architect_of_record",
    "internal_notes",
  ];
  it("maps every legacy header with no definitions loaded", () => {
    const res = validateImport({
      headers: legacyHeaders,
      dataRows: [["Legacy", "legacy", "Residential", "Single Family", "1200", "sq ft", "ACME", "note"]],
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
  it("registers internal/reference columns as mapped, not unknown", () => {
    const mapping = buildImportMapping(HEADERS, DEFS);
    const notes = mapping.columns.find((c) => c.header === "Notes for Sony")!;
    expect(notes.status).toBe("mapped");
    expect(notes.destination).toBe("portfolio_details.internal_notes");
    const ref = mapping.columns.find((c) => c.header === "Original detail text (ref.)")!;
    expect(ref.destination).toBe("portfolio_details.original_website_content");
  });
  it("errors on tag hierarchy violations", () => {
    const res = run([row({ "Project Name (EN)": "T", slug: "t", "Tag 1": "Single Family" })]);
    expect(res.canCommit).toBe(false);
  });
  it("errors on a non-numeric measurement", () => {
    const res = run([row({ "Project Name (EN)": "T", slug: "t", "Floor Area": "big" })]);
    expect(res.canCommit).toBe(false);
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
  it("import save input only includes populated definitions", () => {
    const mapping = buildImportMapping(HEADERS, DEFS);
    const mapped = mapRow(row({ "Project Name (EN)": "T", slug: "t", "Code Consultant": "CC" }), mapping);
    const input = importDynamicSaveInput(mapped);
    expect(input.definitions.map((d) => d.field_key)).toEqual(["code_consultant"]);
    expect(buildLegacyOverrides(input.definitions, input.values)).toEqual({});
  });
});

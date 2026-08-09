/**
 * Phase 5A — Central, definition-driven portfolio import mapping layer.
 *
 * Single source of truth for turning spreadsheet headers into destinations:
 *   core / taxonomy / location / description / service / system
 *   + dynamic specifications & credits (portfolio_field_definitions.source_columns)
 *   + explicitly registered internal / reference-only columns.
 *
 * NOTHING here is client-specific. Dynamic columns come exclusively from the
 * resolved definitions (client scope first, industry fallback) so adding a new
 * definition in the database is enough for the importer to recognise it.
 */

import type {
  DynamicFieldDraft,
  DynamicMetadataState,
  PortfolioFieldDefinition,
} from "@/lib/field-definitions";

/* ------------------------------------------------------------------ *
 * Header normalisation
 * ------------------------------------------------------------------ */

/** Trim, collapse line breaks/whitespace, unify dashes + quotes, lowercase. */
export function normalizeHeader(raw: string): string {
  return (raw ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u2013\u2014\u2012]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* ------------------------------------------------------------------ *
 * Core / legacy contract
 * ------------------------------------------------------------------ */

export type CoreKind =
  | "core"
  | "taxonomy"
  | "location"
  | "description"
  | "service"
  | "system"
  | "internal"
  | "reference"
  | "row-reference"
  | "client-validation"
  | "legacy-metadata";


export interface CoreFieldSpec {
  key: string;
  kind: CoreKind;
  destination: string;
  aliases: string[];
}

/**
 * Every legacy internal CSV header keeps working (the key itself is always an
 * alias). Client-facing spreadsheet headings are added as explicit aliases —
 * never fuzzy-guessed.
 */
export const CORE_FIELDS: CoreFieldSpec[] = [
  { key: "title", kind: "core", destination: "content_items.title", aliases: ["project name (en)", "project name", "title (en)", "project title"] },
  { key: "title_zh", kind: "core", destination: "content_items.title_zh", aliases: ["project name (中文)", "project name (zh)", "title (中文)", "專案名稱"] },
  { key: "slug", kind: "core", destination: "content_items.slug", aliases: ["url slug", "project slug", "project slug (url)", "project slug (url", "slug (url)"] },
  { key: "excerpt", kind: "description", destination: "content_items.excerpt", aliases: ["short description - card (en)", "short description (en)", "short description", "card description (en)"] },
  { key: "excerpt_zh", kind: "description", destination: "content_items.excerpt_zh", aliases: ["short description - card (中文)", "short description (中文)", "short description (zh)"] },
  { key: "body_content", kind: "description", destination: "content_items.body_content", aliases: ["full description (en)", "full description", "body (en)"] },
  { key: "body_content_zh", kind: "description", destination: "content_items.body_content_zh", aliases: ["full description (中文)", "full description (zh)", "body (中文)"] },
  { key: "status", kind: "system", destination: "content_items.status", aliases: ["publish status"] },
  { key: "is_featured", kind: "system", destination: "content_items.is_featured", aliases: ["featured on homepage", "featured", "homepage feature"] },
  { key: "sort_order", kind: "system", destination: "content_items.sort_order", aliases: ["display order", "order"] },
  { key: "seo_title", kind: "core", destination: "content_items.seo_title", aliases: ["seo title (en)"] },
  { key: "seo_title_zh", kind: "core", destination: "content_items.seo_title_zh", aliases: ["seo title (中文)"] },
  { key: "seo_description", kind: "core", destination: "content_items.seo_description", aliases: ["seo description (en)"] },
  { key: "seo_description_zh", kind: "core", destination: "content_items.seo_description_zh", aliases: ["seo description (中文)"] },

  { key: "category", kind: "taxonomy", destination: "categories (level 1)", aliases: ["category"] },
  { key: "category_zh", kind: "taxonomy", destination: "categories.name_zh", aliases: ["category (中文)"] },
  { key: "tag_1", kind: "taxonomy", destination: "tags (level 1)", aliases: ["tag 1"] },
  { key: "tag_1_zh", kind: "taxonomy", destination: "tags.name_zh (level 1)", aliases: ["tag 1 (中文)"] },
  { key: "tag_2", kind: "taxonomy", destination: "tags (level 2)", aliases: ["tag 2"] },
  { key: "tag_2_zh", kind: "taxonomy", destination: "tags.name_zh (level 2)", aliases: ["tag 2 (中文)"] },

  { key: "city", kind: "location", destination: "portfolio_details.city", aliases: ["city"] },
  { key: "province", kind: "location", destination: "portfolio_details.province", aliases: ["province / state", "province/state", "province", "state"] },
  { key: "country", kind: "location", destination: "portfolio_details.country", aliases: ["country"] },
  { key: "location", kind: "location", destination: "portfolio_details.location", aliases: ["location"] },

  { key: "services", kind: "service", destination: "portfolio_details.services", aliases: ["services", "service", "service 1", "service 2", "service 3", "service 4"] },
  { key: "role", kind: "core", destination: "portfolio_details.role", aliases: ["role"] },
  { key: "live_url", kind: "core", destination: "portfolio_details.live_url", aliases: ["live url", "website url"] },

  { key: "project_status", kind: "core", destination: "portfolio_details.project_status", aliases: ["project status"] },
  { key: "year_started", kind: "core", destination: "portfolio_details.year_started", aliases: ["year started"] },
  { key: "year_completed", kind: "core", destination: "portfolio_details.year_completed", aliases: ["year completed"] },
  { key: "project_year", kind: "core", destination: "portfolio_details.project_year", aliases: ["project year", "year"] },

  { key: "floor_area_value", kind: "legacy-metadata", destination: "portfolio_details.floor_area_value", aliases: ["floor area", "floor area value"] },
  { key: "floor_area_unit", kind: "legacy-metadata", destination: "portfolio_details.floor_area_unit", aliases: ["area unit", "floor area unit"] },
  { key: "site_area_value", kind: "legacy-metadata", destination: "portfolio_details.site_area_value", aliases: ["site area", "site area value"] },
  { key: "site_area_unit", kind: "legacy-metadata", destination: "portfolio_details.site_area_unit", aliases: ["site area unit"] },
  { key: "units_count", kind: "legacy-metadata", destination: "portfolio_details.units_count", aliases: ["units", "unit count", "number of units"] },
  { key: "storeys_count", kind: "legacy-metadata", destination: "portfolio_details.storeys_count", aliases: ["storeys", "stories", "number of storeys"] },
  { key: "parking_spaces", kind: "legacy-metadata", destination: "portfolio_details.parking_spaces", aliases: ["parking", "parking spaces"] },
  { key: "construction_budget", kind: "legacy-metadata", destination: "portfolio_details.construction_budget", aliases: ["construction budget", "budget display text"] },

  { key: "scope_of_work", kind: "description", destination: "portfolio_details.scope_of_work", aliases: ["scope of work (en)", "scope of work"] },
  { key: "scope_of_work_zh", kind: "description", destination: "portfolio_details.scope_of_work_zh", aliases: ["scope of work (中文)", "scope of work (zh)"] },
  { key: "key_features", kind: "description", destination: "portfolio_details.key_features", aliases: ["key features / tech notes", "key features", "tech notes"] },
  { key: "key_features_zh", kind: "description", destination: "portfolio_details.key_features_zh", aliases: ["key features (中文)", "key features / tech notes (中文)"] },

  { key: "design_architect", kind: "legacy-metadata", destination: "portfolio_details.design_architect", aliases: ["design architect"] },
  { key: "architect_of_record", kind: "legacy-metadata", destination: "portfolio_details.architect_of_record", aliases: ["architect of record", "architect of record / bp architect", "bp architect"] },
  { key: "interior_designer", kind: "legacy-metadata", destination: "portfolio_details.interior_designer", aliases: ["interior designer"] },
  { key: "landscape_architect", kind: "legacy-metadata", destination: "portfolio_details.landscape_architect", aliases: ["landscape architect"] },
  { key: "structural_engineer", kind: "legacy-metadata", destination: "portfolio_details.structural_engineer", aliases: ["structural engineer"] },
  { key: "mechanical_engineer", kind: "legacy-metadata", destination: "portfolio_details.mechanical_engineer", aliases: ["mechanical engineer"] },
  { key: "electrical_engineer", kind: "legacy-metadata", destination: "portfolio_details.electrical_engineer", aliases: ["electrical engineer"] },
  { key: "civil_engineer", kind: "legacy-metadata", destination: "portfolio_details.civil_engineer", aliases: ["civil engineer"] },
  { key: "other_consultants", kind: "legacy-metadata", destination: "portfolio_details.other_consultants", aliases: ["other consultants"] },
  { key: "general_contractor", kind: "legacy-metadata", destination: "portfolio_details.general_contractor", aliases: ["general contractor"] },
  { key: "developer_owner_client", kind: "legacy-metadata", destination: "portfolio_details.developer_owner_client", aliases: ["developer / owner / client", "developer", "owner", "client"] },
  { key: "photographer", kind: "legacy-metadata", destination: "portfolio_details.photographer", aliases: ["photographer", "photo credit"] },
  { key: "other_credits", kind: "legacy-metadata", destination: "portfolio_details.other_credits", aliases: ["other credits"] },
  { key: "awards", kind: "legacy-metadata", destination: "portfolio_details.awards", aliases: ["awards"] },
  { key: "publications", kind: "legacy-metadata", destination: "portfolio_details.publications", aliases: ["publications"] },

  { key: "image_prefix", kind: "system", destination: "portfolio_details.image_prefix", aliases: ["image prefix", "main image (file)", "main image file", "main image"] },
  { key: "image_file", kind: "system", destination: "image matching (reference)", aliases: ["image file"] },
  { key: "expected_gallery_count", kind: "system", destination: "portfolio_details.expected_gallery_count", aliases: ["gallery image count", "expected gallery count"] },

  { key: "original_website_content", kind: "reference", destination: "portfolio_details.original_website_content", aliases: ["original detail text (ref.)", "original detail text (ref)", "original detail text", "original website content"] },
  { key: "internal_notes", kind: "internal", destination: "portfolio_details.internal_notes", aliases: ["notes for sony", "internal notes", "notes (internal)", "notes"] },

  // Spreadsheet-only columns: recognised, never stored as project metadata.
  { key: "row_reference", kind: "row-reference", destination: "Row Reference (spreadsheet sequence)", aliases: ["#", "no", "no.", "row", "row #", "item #"] },
  { key: "company", kind: "client-validation", destination: "selectedClient.client_name", aliases: ["company", "company name", "client company"] },
];


/** All canonical core keys (legacy CSV contract). */
export const CORE_KEYS = CORE_FIELDS.map((f) => f.key);

const CORE_BY_ALIAS = new Map<string, CoreFieldSpec>();
for (const spec of CORE_FIELDS) {
  CORE_BY_ALIAS.set(normalizeHeader(spec.key), spec);
  for (const a of spec.aliases) CORE_BY_ALIAS.set(normalizeHeader(a), spec);
}

export const coreSpecFor = (header: string): CoreFieldSpec | undefined =>
  CORE_BY_ALIAS.get(normalizeHeader(header));

/* ------------------------------------------------------------------ *
 * Column mapping
 * ------------------------------------------------------------------ */

export type ColumnType =
  | "Core"
  | "Taxonomy"
  | "Location"
  | "Description"
  | "Service"
  | "System"
  | "Internal"
  | "Reference"
  | "Client Validation"

  | "Dynamic Specification"
  | "Dynamic Credit"
  | "Dynamic Metadata"
  | "Unknown";

export type DynamicPart = "value" | "unit" | "display";

export interface ColumnMapping {
  index: number;
  header: string;
  normalized: string;
  type: ColumnType;
  destination: string;
  status: "mapped" | "unmapped";
  core?: CoreFieldSpec;
  definition?: PortfolioFieldDefinition;
  part?: DynamicPart;
  note?: string;
}

export interface ImportMapping {
  columns: ColumnMapping[];
  /** core key -> column index (first wins; extra service columns tracked separately) */
  coreIndex: Record<string, number>;
  /** every column index feeding a `services` list */
  serviceIndexes: number[];
  /** definitions that own at least one column present in the sheet */
  usedDefinitions: PortfolioFieldDefinition[];
  unmappedColumns: ColumnMapping[];
}

const sectionType = (def: PortfolioFieldDefinition): ColumnType =>
  def.section === "specifications"
    ? "Dynamic Specification"
    : def.section === "credits"
      ? "Dynamic Credit"
      : "Dynamic Metadata";

const coreType = (kind: CoreKind): ColumnType =>
  kind === "taxonomy"
    ? "Taxonomy"
    : kind === "location"
      ? "Location"
      : kind === "description"
        ? "Description"
        : kind === "service"
          ? "Service"
          : kind === "system"
            ? "System"
            : kind === "internal"
              ? "Internal"
              : kind === "reference"
                ? "Reference"
                : "Core";

/** value / unit / display role of a definition source column, by type + position. */
function dynamicPart(
  def: PortfolioFieldDefinition,
  normalized: string,
  position: number,
): DynamicPart {
  if (def.field_type === "measurement") {
    if (position === 0) return "value";
    return normalized.includes("unit") || position === 1 ? "unit" : "value";
  }
  if (def.field_type === "currency") {
    if (normalized.includes("display") || normalized.includes("text")) return "display";
    return position === 0 ? "value" : "display";
  }
  return "value";
}

/**
 * Build the header → destination contract.
 * Dynamic definitions take precedence over a same-named core column, because
 * dynamic values are authoritative and dual-write to the legacy column anyway.
 */
export function buildImportMapping(
  headers: string[],
  definitions: PortfolioFieldDefinition[],
): ImportMapping {
  // normalized source column -> [definition, position]
  const dynamicByHeader = new Map<string, { def: PortfolioFieldDefinition; position: number }>();
  for (const def of definitions) {
    const cols = Array.isArray(def.source_columns) ? def.source_columns : [];
    cols.forEach((c, position) => {
      const n = normalizeHeader(String(c ?? ""));
      if (!n || dynamicByHeader.has(n)) return;
      dynamicByHeader.set(n, { def, position });
    });
  }

  const columns: ColumnMapping[] = [];
  const coreIndex: Record<string, number> = {};
  const serviceIndexes: number[] = [];
  const usedDefs = new Map<string, PortfolioFieldDefinition>();

  headers.forEach((raw, index) => {
    const header = (raw ?? "").replace(/^\uFEFF/, "").trim();
    const normalized = normalizeHeader(header);

    const dyn = dynamicByHeader.get(normalized);
    if (dyn) {
      const part = dynamicPart(dyn.def, normalized, dyn.position);
      usedDefs.set(dyn.def.id, dyn.def);
      columns.push({
        index,
        header,
        normalized,
        type: sectionType(dyn.def),
        destination: `${dyn.def.section}.${dyn.def.field_key}${part === "value" ? "" : `.${part}`}`,
        status: "mapped",
        definition: dyn.def,
        part,
      });
      return;
    }

    const core = coreSpecFor(normalized);
    if (core) {
      if (core.kind === "service") serviceIndexes.push(index);
      else if (coreIndex[core.key] === undefined) coreIndex[core.key] = index;
      columns.push({
        index,
        header,
        normalized,
        type: coreType(core.kind),
        destination: core.destination,
        status: "mapped",
        core,
        note:
          core.kind === "internal"
            ? "Internal / not rendered publicly"
            : core.kind === "reference"
              ? "Reference only / not rendered publicly"
              : undefined,
      });
      return;
    }

    columns.push({
      index,
      header,
      normalized,
      type: "Unknown",
      destination: "—",
      status: "unmapped",
    });
  });

  return {
    columns,
    coreIndex,
    serviceIndexes,
    usedDefinitions: [...usedDefs.values()],
    unmappedColumns: columns.filter((c) => c.status === "unmapped"),
  };
}

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

export interface MappedRow {
  /** canonical core key -> trimmed cell value */
  core: Record<string, string>;
  /** dynamic drafts, definition-driven (only populated fields present) */
  dynamic: DynamicMetadataState;
  /** definitions that actually received a value on this row */
  populatedDefinitions: PortfolioFieldDefinition[];
  specificationCount: number;
  creditCount: number;
  /** non-empty cells whose column could not be mapped */
  unmapped: { header: string; value: string }[];
  /** blank cells in unknown columns (informational only) */
  unmappedEmptyHeaders: string[];
}

const cell = (cols: string[], i: number) => (cols[i] ?? "").toString().trim();

export function mapRow(cols: string[], mapping: ImportMapping): MappedRow {
  const core: Record<string, string> = {};
  for (const key of CORE_KEYS) core[key] = "";

  for (const [key, i] of Object.entries(mapping.coreIndex)) core[key] = cell(cols, i);

  if (mapping.serviceIndexes.length > 0) {
    const values = mapping.serviceIndexes
      .map((i) => cell(cols, i))
      .flatMap((v) => v.split(/[;|]/))
      .map((v) => v.trim())
      .filter(Boolean);
    core.services = Array.from(new Set(values)).join("; ");
  }

  // dynamic drafts
  const drafts = new Map<string, DynamicFieldDraft & { def: PortfolioFieldDefinition }>();
  for (const col of mapping.columns) {
    if (!col.definition) continue;
    const value = cell(cols, col.index);
    if (!value) continue;
    const def = col.definition;
    const key = `${def.section}::${def.field_key}`;
    const draft = drafts.get(key) ?? { value: "", def };
    if (col.part === "unit") draft.unit = value;
    else if (col.part === "display") draft.value = value;
    else if (def.field_type === "currency") {
      const n = Number(value.replace(/[,$\s]/g, ""));
      draft.extra = { ...(draft.extra ?? {}) };
      if (Number.isFinite(n)) draft.extra["value"] = n;
      const currency = (def.settings ?? {})["currency"];
      if (typeof currency === "string" && currency) draft.extra["currency"] = currency;
      if (!draft.value) draft.value = value; // display fallback until a display column arrives
    } else {
      draft.value = value;
    }
    drafts.set(key, draft);
  }

  const dynamic: DynamicMetadataState = {};
  const populatedDefinitions: PortfolioFieldDefinition[] = [];
  for (const entry of drafts.values()) {
    const { def, ...draft } = entry;
    if (!(draft.value ?? "").trim()) continue; // never save blank JSON values
    dynamic[def.section] ??= {};
    dynamic[def.section][def.field_key] = draft;
    populatedDefinitions.push(def);
  }

  const unmapped: { header: string; value: string }[] = [];
  const unmappedEmptyHeaders: string[] = [];
  for (const col of mapping.unmappedColumns) {
    const value = cell(cols, col.index);
    if (value) unmapped.push({ header: col.header, value });
    else unmappedEmptyHeaders.push(col.header);
  }

  return {
    core,
    dynamic,
    populatedDefinitions,
    specificationCount: populatedDefinitions.filter((d) => d.section === "specifications").length,
    creditCount: populatedDefinitions.filter((d) => d.section === "credits").length,
    unmapped,
    unmappedEmptyHeaders,
  };
}

/**
 * Dynamic save payload for imports: ONLY definitions with a populated value,
 * so a blank spreadsheet cell can never clear an existing value or null a
 * legacy column (Phase 3 semantics are otherwise unchanged).
 */
export function importDynamicSaveInput(row: MappedRow) {
  return { definitions: row.populatedDefinitions, values: row.dynamic };
}

/* ------------------------------------------------------------------ *
 * Slug + image validation helpers
 * ------------------------------------------------------------------ */

export function slugifyTitle(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const SAFE_SLUG = /^[a-z0-9\u4e00-\u9fff]+(?:-[a-z0-9\u4e00-\u9fff]+)*$/;

export const isUrlSafeSlug = (slug: string) => SAFE_SLUG.test(slug);

export interface SlugResolution {
  slug: string;
  supplied: string;
  normalized: boolean;
  reason?: string;
}

/** Never rewrites silently: `normalized` flags anything the user must review. */
export function resolveSlug(suppliedRaw: string, title: string): SlugResolution {
  const supplied = (suppliedRaw ?? "").trim();
  if (!supplied) {
    const slug = slugifyTitle(title);
    return { slug, supplied: "", normalized: false, reason: slug ? undefined : "Cannot derive slug" };
  }
  if (isUrlSafeSlug(supplied)) return { slug: supplied, supplied, normalized: false };
  const slug = slugifyTitle(supplied);
  return {
    slug,
    supplied,
    normalized: true,
    reason: `Slug "${supplied}" is not URL-safe and would be normalized to "${slug}"`,
  };
}

/** Loose relatedness check between an image prefix/filename and the slug. */
export function imagePrefixLooksRelated(prefix: string, slug: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const p = norm(prefix.replace(/\.[a-z0-9]+$/i, ""));
  const s = norm(slug);
  if (!p || !s) return true;
  if (p.includes(s) || s.includes(p)) return true;
  const head = s.slice(0, Math.min(6, s.length));
  return head.length >= 4 && p.includes(head);
}

/**
 * Phase 5A — strict, definition-driven import validation (dry run).
 * Pure functions: no Supabase writes happen here.
 */

import type { PortfolioFieldDefinition } from "@/lib/field-definitions";
import {
  buildImportMapping,
  imagePrefixLooksRelated,
  mapRow,
  resolveSlug,
  type ColumnMapping,
  type ImportMapping,
  type MappedRow,
  type SlugResolution,
} from "@/lib/portfolio-import-mapping";

export type Severity = "error" | "warning" | "info";

export interface Issue {
  severity: Severity;
  message: string;
  column?: string;
  value?: string;
}

export interface ValidatedRow {
  rowNumber: number;
  mapped: MappedRow;
  title: string;
  slug: string;
  /** slug actually used to look up an existing project (supplied slug wins) */
  matchSlug: string;
  slugResolution: SlugResolution;

  category: string;
  tag1: string;
  tag2: string;
  action: "create" | "update" | "invalid";
  issues: Issue[];
}

export interface ValidationResult {
  mapping: ImportMapping;
  rows: ValidatedRow[];
  columnIssues: Issue[];
  totals: {
    rows: number;
    create: number;
    update: number;
    errors: number;
    warnings: number;
  };
  canCommit: boolean;
}

const isNumeric = (v: string) => Number.isFinite(Number(v.replace(/[,$\s]/g, "")));

const splitList = (raw: string) =>
  raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Definition-driven per-value type checks. */
function validateDynamic(row: MappedRow, mapping: ImportMapping): Issue[] {
  const issues: Issue[] = [];
  for (const col of mapping.columns) {
    const def = col.definition;
    if (!def) continue;
    const draft = row.dynamic[def.section]?.[def.field_key];
    if (!draft) continue;
    const raw = col.part === "unit" ? (draft.unit ?? "") : draft.value;
    if (!raw) continue;
    if (
      (def.field_type === "number" || def.field_type === "measurement") &&
      col.part !== "unit" &&
      !isNumeric(raw)
    ) {
      issues.push({
        severity: "error",
        column: col.header,
        value: raw,
        message: `"${col.header}" expects a number for ${def.label_en} but got "${raw}"`,
      });
    }
    if (def.field_type === "year" && col.part !== "unit" && !/^\d{4}([-/\s].*)?$/.test(raw)) {
      issues.push({
        severity: "warning",
        column: col.header,
        value: raw,
        message: `"${col.header}" does not look like a year value ("${raw}")`,
      });
    }
  }
  return issues;
}

export interface ValidateOptions {
  headers: string[];
  dataRows: string[][];
  definitions: PortfolioFieldDefinition[];
  /** slugs that already exist for the selected client */
  existingSlugs: Set<string>;
  strict: boolean;
  /** optional per-row image findings (matched gallery count keyed by row index) */
  galleryCounts?: Map<number, number>;
  /** selected client name — used to validate a spreadsheet "Company" column */
  clientName?: string;
}

export function validateImport(opts: ValidateOptions): ValidationResult {
  const { headers, dataRows, definitions, existingSlugs, strict } = opts;
  const mapping = buildImportMapping(headers, definitions);
  const companyIdx = mapping.coreIndex["company"];
  const expectedCompany = (opts.clientName ?? "").trim().toLowerCase();


  const columnIssues: Issue[] = [];
  const dynamicHeaders = new Set(
    definitions
      .flatMap((d) => (Array.isArray(d.source_columns) ? d.source_columns : []))
      .map((c) => String(c ?? "").trim().toLowerCase()),
  );
  for (const col of mapping.unmappedColumns) {
    if (dynamicHeaders.has(col.header.toLowerCase())) {
      columnIssues.push({
        severity: "error",
        column: col.header,
        message: `"${col.header}" is a dynamic source column with no active field definition for this client`,
      });
    }
  }

  const slugSeen = new Map<string, number>();
  const rows: ValidatedRow[] = [];

  dataRows.forEach((cols, i) => {
    const rowNumber = i + 2; // 1-based incl. header row
    const mapped = mapRow(cols, mapping);
    const issues: Issue[] = [];

    const title = mapped.core.title ?? "";
    const slugRes = resolveSlug(mapped.core.slug ?? "", title);
    const slug = slugRes.slug;

    if (!title) issues.push({ severity: "error", column: "title", message: "Missing title" });
    if (!slug)
      issues.push({
        severity: "error",
        column: "slug",
        message: "Missing slug and no title to derive one from",
      });

    if (slugRes.normalized) {
      issues.push({
        severity: "warning",
        column: "slug",
        value: slugRes.supplied,
        message: `${slugRes.reason}. Supplied: "${slugRes.supplied}" · Proposed: "${slugRes.slug}". Review before committing — an existing project's slug is never rewritten silently.`,
      });
    }

    // Company column: client validation only, never stored as project metadata.
    if (companyIdx !== undefined) {
      const company = (cols[companyIdx] ?? "").trim();
      if (company && expectedCompany && company.toLowerCase() !== expectedCompany) {
        issues.push({
          severity: "error",
          column: "Company",
          value: company,
          message: `Client mismatch: spreadsheet row belongs to "${company}" but the selected BluLuma client is "${opts.clientName}".`,
        });
      }
    }



    if (slug) {
      const prev = slugSeen.get(slug);
      if (prev !== undefined) {
        issues.push({
          severity: "error",
          column: "slug",
          value: slug,
          message: `Duplicate slug "${slug}" — also used by row ${prev}`,
        });
      } else {
        slugSeen.set(slug, rowNumber);
      }
    }

    // unmapped populated columns — the core rule
    for (const u of mapped.unmapped) {
      issues.push({
        severity: strict ? "error" : "warning",
        column: u.header,
        value: u.value,
        message: `Unmapped column "${u.header}" has a value on row ${rowNumber}${
          slug ? ` (${slug})` : ""
        }: "${u.value}". No known destination — register it as a core alias, a definition source column, or as reference/internal.`,
      });
    }

    // taxonomy hierarchy
    const category = (mapped.core.category ?? "").trim();
    const tag1 = (mapped.core.tag_1 ?? "").trim();
    const tag2 = (mapped.core.tag_2 ?? "").trim();
    if (tag1 && !category)
      issues.push({
        severity: "error",
        column: "tag_1",
        message: "Tag 1 supplied without a Category — hierarchy Category → Tag 1 → Tag 2 is required",
      });
    if (tag2 && !tag1)
      issues.push({
        severity: "error",
        column: "tag_2",
        message: "Tag 2 supplied without a Tag 1",
      });
    if (tag1 && !tag2)
      issues.push({ severity: "warning", column: "tag_2", message: "Tag 2 is blank (optional)" });
    if (category && splitList(category).length === 0)
      issues.push({ severity: "error", column: "category", message: "Category name is empty" });

    issues.push(...validateDynamic(mapped, mapping));

    // image consistency
    const prefix = (mapped.core.image_prefix ?? "").trim();
    if (prefix && slug && !imagePrefixLooksRelated(prefix, slug)) {
      issues.push({
        severity: "warning",
        column: "image_prefix",
        value: prefix,
        message: `Main image "${prefix}" appears unrelated to project slug "${slug}" — review manually, no automatic correction is applied`,
      });
    }
    const expected = parseInt(mapped.core.expected_gallery_count || "", 10);
    const matched = opts.galleryCounts?.get(i);
    if (Number.isFinite(expected) && expected > 0 && matched !== undefined && matched !== expected) {
      issues.push({
        severity: "warning",
        column: "expected_gallery_count",
        message: `Expected ${expected} gallery images, matched ${matched}`,
      });
    }

    // internal / reference visibility
    for (const col of mapping.columns) {
      if (col.core?.kind !== "internal" && col.core?.kind !== "reference") continue;
      const value = (cols[col.index] ?? "").trim();
      if (!value) continue;
      issues.push({
        severity: "info",
        column: col.header,
        message: `${col.header} → ${col.destination} (${col.note})`,
      });
    }

    const hasError = issues.some((x) => x.severity === "error");
    // Identity is the SUPPLIED spreadsheet slug first; the normalized form is
    // only a secondary lookup so an unsafe legacy slug can't create a duplicate.
    const suppliedSlug = slugRes.supplied;
    const matchedSlug = suppliedSlug && existingSlugs.has(suppliedSlug) ? suppliedSlug : slug;
    const exists = matchedSlug ? existingSlugs.has(matchedSlug) : false;
    const action: ValidatedRow["action"] = hasError ? "invalid" : exists ? "update" : "create";

    if (!hasError) {
      issues.push({
        severity: "info",
        message: exists
          ? `Existing project "${matchedSlug}" will be updated`
          : `New project "${slug}" will be created`,
      });
    }


    rows.push({
      rowNumber,
      mapped,
      title,
      slug,
      slugResolution: slugRes,
      category,
      tag1,
      tag2,
      action,
      issues,
    });
  });

  const errors =
    columnIssues.filter((i) => i.severity === "error").length +
    rows.reduce((n, r) => n + r.issues.filter((i) => i.severity === "error").length, 0);
  const warnings =
    columnIssues.filter((i) => i.severity === "warning").length +
    rows.reduce((n, r) => n + r.issues.filter((i) => i.severity === "warning").length, 0);

  return {
    mapping,
    rows,
    columnIssues,
    totals: {
      rows: rows.length,
      create: rows.filter((r) => r.action === "create").length,
      update: rows.filter((r) => r.action === "update").length,
      errors,
      warnings,
    },
    canCommit: rows.length > 0 && errors === 0,
  };
}

export type { ColumnMapping };

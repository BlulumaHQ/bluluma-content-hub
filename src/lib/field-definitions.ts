import { supabase } from "@/lib/supabase";
import type { Client, PortfolioDetail } from "@/types";

/**
 * Phase 2 — READ-ONLY dynamic portfolio metadata layer.
 * Generic, definition-driven. No client-specific field names live in this file.
 */

export type FieldSection = "specifications" | "credits" | "custom";

export interface PortfolioFieldDefinition {
  id: string;
  scope_type: "industry" | "client";
  industry: string | null;
  client_id: string | null;
  content_type: string;
  section: string;
  field_key: string;
  label_en: string;
  label_zh: string | null;
  field_type: string;
  source_columns: string[] | null;
  display_order: number | null;
  is_required: boolean | null;
  show_in_cms: boolean | null;
  show_on_frontend: boolean | null;
  is_active: boolean | null;
  settings: Record<string, unknown> | null;
}

export interface DynamicMetadataField {
  definition: PortfolioFieldDefinition;
  label: string;
  labelZh: string | null;
  value: string;
}

export interface DynamicMetadataSection {
  section: string;
  title: string;
  fields: DynamicMetadataField[];
}

export type DynamicMetadata = DynamicMetadataSection[];

export const SECTION_ORDER = ["specifications", "credits", "custom"];

export const SECTION_TITLES: Record<string, string> = {
  specifications: "Specifications",
  credits: "Credits",
  custom: "Custom",
};

/**
 * Client-specific definitions win outright; industry definitions are a fallback
 * only when a client has no active client-scoped definitions.
 */
export async function getPortfolioFieldDefinitions(
  client: Pick<Client, "id" | "industry"> | null | undefined,
): Promise<PortfolioFieldDefinition[]> {
  if (!client?.id) return [];

  const base = () =>
    supabase
      .from("portfolio_field_definitions")
      .select("*")
      .eq("content_type", "portfolio")
      .eq("is_active", true)
      .eq("show_in_cms", true);

  const { data: clientDefs, error: clientError } = await base()
    .eq("scope_type", "client")
    .eq("client_id", client.id);

  if (clientError) {
    console.error("[field-definitions] client scope query failed", clientError);
    throw clientError;
  }

  if (clientDefs && clientDefs.length > 0) {
    return sortDefinitions(clientDefs as PortfolioFieldDefinition[]);
  }

  if (!client.industry) return [];

  const { data: industryDefs, error: industryError } = await base()
    .eq("scope_type", "industry")
    .eq("industry", client.industry);

  if (industryError) {
    console.error("[field-definitions] industry scope query failed", industryError);
    throw industryError;
  }

  return sortDefinitions((industryDefs ?? []) as PortfolioFieldDefinition[]);
}

function sortDefinitions(defs: PortfolioFieldDefinition[]) {
  return [...defs].sort((a, b) => {
    const sa = SECTION_ORDER.indexOf(a.section);
    const sb = SECTION_ORDER.indexOf(b.section);
    const oa = sa === -1 ? SECTION_ORDER.length : sa;
    const ob = sb === -1 ? SECTION_ORDER.length : sb;
    if (oa !== ob) return oa - ob;
    return (a.display_order ?? 0) - (b.display_order ?? 0);
  });
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function num(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-US");
}

/** Raw value lookup: JSONB first, legacy columns second. */
function resolveRawValue(
  def: PortfolioFieldDefinition,
  jsonSection: Record<string, unknown> | undefined,
  details: PortfolioDetail | Record<string, unknown> | null | undefined,
): unknown {
  const jsonValue = jsonSection?.[def.field_key];
  if (!isEmpty(jsonValue)) return jsonValue;

  const settings = (def.settings ?? {}) as Record<string, unknown>;
  const row = (details ?? {}) as Record<string, unknown>;

  const valueCol = settings["legacy_value_column"] as string | undefined;
  const unitCol = settings["legacy_unit_column"] as string | undefined;
  if (valueCol) {
    const v = row[valueCol];
    if (!isEmpty(v)) {
      const unit = unitCol ? row[unitCol] : settings["default_unit"];
      return isEmpty(unit) ? { value: v } : { value: v, unit };
    }
  }

  const column = settings["legacy_column"] as string | undefined;
  if (column) {
    const v = row[column];
    if (!isEmpty(v)) return v;
  }

  return undefined;
}

/** Definition-driven formatting; never yields "undefined"/"[object Object]". */
export function formatFieldValue(def: PortfolioFieldDefinition, raw: unknown): string {
  if (isEmpty(raw)) return "";

  const settings = (def.settings ?? {}) as Record<string, unknown>;

  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const display = obj["display"];
    if (typeof display === "string" && display.trim()) return display.trim();

    const valueKey = (settings["value_key"] as string) ?? "value";
    const unitKey = (settings["unit_key"] as string) ?? "unit";
    const value = obj[valueKey];
    if (isEmpty(value)) return "";
    const unit = !isEmpty(obj[unitKey]) ? obj[unitKey] : settings["default_unit"];
    const formatted =
      typeof value === "number" || def.field_type === "measurement" || def.field_type === "number"
        ? num(value)
        : String(value);
    return isEmpty(unit) ? formatted : `${formatted} ${String(unit)}`;
  }

  if (Array.isArray(raw)) {
    return raw.filter((v) => !isEmpty(v)).map((v) => String(v)).join(", ");
  }

  if (def.field_type === "year") return String(raw);
  if (def.field_type === "number" || def.field_type === "measurement") return num(raw);

  return String(raw).trim();
}

/** Builds render-ready sections; empty values and empty sections are dropped. */
export function buildDynamicMetadata(
  definitions: PortfolioFieldDefinition[],
  details: PortfolioDetail | null | undefined,
): DynamicMetadata {
  const extra = (details?.additional_project_data ?? {}) as Record<string, unknown>;
  const sections: DynamicMetadataSection[] = [];

  for (const def of sortDefinitions(definitions)) {
    const jsonSection = extra?.[def.section] as Record<string, unknown> | undefined;
    const raw = resolveRawValue(def, jsonSection, details);
    const value = formatFieldValue(def, raw);
    if (!value) continue;

    let bucket = sections.find((s) => s.section === def.section);
    if (!bucket) {
      bucket = {
        section: def.section,
        title: SECTION_TITLES[def.section] ?? def.section,
        fields: [],
      };
      sections.push(bucket);
    }
    bucket.fields.push({
      definition: def,
      label: def.label_en,
      labelZh: def.label_zh,
      value,
    });
  }

  return sections;
}

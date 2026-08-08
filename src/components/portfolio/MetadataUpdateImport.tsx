import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileText, Loader2, RotateCcw, Upload, XCircle } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Client } from "@/types";

/** Minimal CSV parser (quoted fields, embedded commas/newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      cur.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  cur.push(field);
  rows.push(cur);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

type FieldKind = "text" | "num" | "int" | "bool" | "array" | "status";

/** Columns updatable on content_items. */
const CONTENT_FIELDS: Record<string, FieldKind> = {
  title: "text",
  title_zh: "text",
  excerpt: "text",
  excerpt_zh: "text",
  body_content: "text",
  body_content_zh: "text",
  featured_image_url: "text",
  status: "status",
  is_featured: "bool",
  sort_order: "int",
  seo_title: "text",
  seo_title_zh: "text",
  seo_description: "text",
  seo_description_zh: "text",
};

/** Columns updatable on portfolio_details. */
const DETAIL_FIELDS: Record<string, FieldKind> = {
  live_url: "text",
  services: "array",
  architect_roles: "array",
  project_year: "text",
  short_summary: "text",
  location: "text",
  role: "text",
  city: "text",
  province: "text",
  country: "text",
  project_status: "text",
  year_started: "text",
  year_completed: "text",
  floor_area_value: "num",
  floor_area_unit: "text",
  site_area_value: "num",
  site_area_unit: "text",
  units_count: "int",
  storeys_count: "int",
  parking_spaces: "int",
  construction_budget: "text",
  scope_of_work: "text",
  scope_of_work_zh: "text",
  key_features: "text",
  key_features_zh: "text",
  design_architect: "text",
  architect_of_record: "text",
  interior_designer: "text",
  landscape_architect: "text",
  structural_engineer: "text",
  mechanical_engineer: "text",
  electrical_engineer: "text",
  civil_engineer: "text",
  other_consultants: "text",
  general_contractor: "text",
  developer_owner_client: "text",
  photographer: "text",
  other_credits: "text",
  awards: "text",
  publications: "text",
  original_website_content: "text",
  internal_notes: "text",
  image_prefix: "text",
  expected_gallery_count: "int",
};

const CLEAR = "[CLEAR]";

function coerce(kind: FieldKind, raw: string): unknown | undefined {
  const v = raw.trim();
  if (v === "") return undefined; // absent → leave untouched
  if (v === CLEAR) return kind === "array" ? [] : null;
  switch (kind) {
    case "num": {
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : undefined;
    }
    case "int": {
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? Math.round(n) : undefined;
    }
    case "bool":
      return ["true", "yes", "1", "y"].includes(v.toLowerCase());
    case "array":
      return Array.from(
        new Set(
          v
            .split(/[;|]/)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      );
    case "status": {
      const s = v.toLowerCase();
      return ["draft", "published", "archived"].includes(s) ? s : undefined;
    }
    default:
      return v;
  }
}

interface Row {
  slug: string;
  title: string;
  contentId: string | null;
  matched: boolean;
  contentPayload: Record<string, unknown>;
  detailPayload: Record<string, unknown>;
  changedFields: string[];
  warnings: string[];
  status: "pending" | "importing" | "success" | "skipped" | "failed";
  message?: string;
}

export default function MetadataUpdateImport({ client }: { client: Client }) {
  const qc = useQueryClient();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<{ updated: number; skipped: number; failed: number } | null>(
    null,
  );

  const summary = useMemo(() => {
    const matched = rows.filter((r) => r.matched);
    return {
      total: rows.length,
      matched: matched.length,
      unmatched: rows.length - matched.length,
      toUpdate: matched.filter((r) => r.changedFields.length > 0).length,
      noChange: matched.filter((r) => r.changedFields.length === 0).length,
      toCreate: 0 as const,
    };
  }, [rows]);

  const reset = () => {
    setCsvFile(null);
    setRows([]);
    setParseError(null);
    setProgress(0);
    setDone(null);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const handleCsv = async (file: File | null) => {
    setRows([]);
    setParseError(null);
    setDone(null);
    setCsvFile(file);
    if (!file) return;
    setParsing(true);
    try {
      const table = parseCsv(await file.text());
      if (table.length < 2) throw new Error("CSV needs a header row and at least one data row.");
      const header = table[0].map((h) => h.trim().toLowerCase());
      const idx = (k: string) => header.indexOf(k);
      const slugIdx = idx("slug");
      const titleIdx = idx("title");
      if (slugIdx === -1 && titleIdx === -1)
        throw new Error("CSV must contain a `slug` or `title` column to match existing projects.");

      const parsed: Row[] = table.slice(1).map((cols) => {
        const get = (k: string) => {
          const i = idx(k);
          return i === -1 ? "" : (cols[i] ?? "");
        };
        const title = get("title").trim();
        const slug = (get("slug").trim() || slugify(title)).toLowerCase();

        const contentPayload: Record<string, unknown> = {};
        const detailPayload: Record<string, unknown> = {};
        const changedFields: string[] = [];
        const warnings: string[] = [];

        for (const [key, kind] of Object.entries(CONTENT_FIELDS)) {
          if (idx(key) === -1) continue;
          const val = coerce(kind, get(key));
          if (val === undefined) continue;
          contentPayload[key] = val;
          changedFields.push(key);
        }
        for (const [key, kind] of Object.entries(DETAIL_FIELDS)) {
          if (idx(key) === -1) continue;
          const val = coerce(kind, get(key));
          if (val === undefined) continue;
          detailPayload[key] = val;
          changedFields.push(key);
        }

        if (!slug) warnings.push("Missing slug/title — cannot match");
        if (idx("status") !== -1 && get("status").trim() && !("status" in contentPayload))
          warnings.push(`Unknown status "${get("status").trim()}" — ignored`);

        return {
          slug,
          title,
          contentId: null,
          matched: false,
          contentPayload,
          detailPayload,
          changedFields,
          warnings,
          status: "pending",
        };
      });

      const slugs = Array.from(new Set(parsed.map((r) => r.slug).filter(Boolean)));
      const found = new Map<string, { id: string; title: string }>();
      for (let i = 0; i < slugs.length; i += 100) {
        const { data, error } = await supabase
          .from("content_items")
          .select("id, slug, title")
          .eq("client_id", client.id)
          .eq("content_type", "portfolio")
          .in("slug", slugs.slice(i, i + 100));
        if (error) throw new Error(error.message);
        (data ?? []).forEach((d) => found.set(String(d.slug), { id: d.id, title: d.title }));
      }

      for (const r of parsed) {
        const hit = r.slug ? found.get(r.slug) : undefined;
        if (hit) {
          r.matched = true;
          r.contentId = hit.id;
          if (!r.title) r.title = hit.title;
        } else {
          r.warnings.push("NOT MATCHED — SKIPPED");
        }
      }
      setRows(parsed);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse CSV");
    } finally {
      setParsing(false);
    }
  };

  const runImport = async () => {
    const targets = rows.filter((r) => r.matched && r.contentId && r.changedFields.length > 0);
    if (!targets.length) {
      toast.error("Nothing to update.");
      return;
    }
    setImporting(true);
    setProgress(0);
    setDone(null);
    const next = [...rows];
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < next.length; i++) {
      const row = next[i];
      if (!row.matched || !row.contentId) {
        row.status = "skipped";
        row.message = "No matching project";
        continue;
      }
      if (row.changedFields.length === 0) {
        row.status = "skipped";
        row.message = "No fields to update";
        continue;
      }
      row.status = "importing";
      setRows([...next]);
      try {
        if (Object.keys(row.contentPayload).length) {
          const { error } = await supabase
            .from("content_items")
            .update({ ...row.contentPayload, updated_at: new Date().toISOString() })
            .eq("id", row.contentId)
            .eq("client_id", client.id);
          if (error) throw new Error(error.message);
        }
        if (Object.keys(row.detailPayload).length) {
          const { data: existing, error: fetchErr } = await supabase
            .from("portfolio_details")
            .select("id")
            .eq("content_id", row.contentId)
            .maybeSingle();
          if (fetchErr) throw new Error(fetchErr.message);
          const payload = { ...row.detailPayload, updated_at: new Date().toISOString() };
          if (existing) {
            const { error } = await supabase
              .from("portfolio_details")
              .update(payload)
              .eq("content_id", row.contentId);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase
              .from("portfolio_details")
              .insert({ ...payload, content_id: row.contentId });
            if (error) throw new Error(error.message);
          }
        }
        row.status = "success";
        row.message = `${row.changedFields.length} field(s) updated`;
        updated++;
      } catch (e) {
        row.status = "failed";
        row.message = e instanceof Error ? e.message : "Update failed";
        failed++;
      }
      setRows([...next]);
      setProgress(Math.round(((i + 1) / next.length) * 100));
    }

    const skipped = next.filter((r) => r.status === "skipped").length;
    setDone({ updated, skipped, failed });
    setImporting(false);
    qc.invalidateQueries({ queryKey: ["portfolio"] });
    toast.success(`Updated ${updated} project(s) · ${skipped} skipped · ${failed} failed`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Update Existing Project Metadata</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Matches existing projects by client + slug and updates only the CSV columns provided.
            Never creates projects, and never touches galleries, media, categories or tags. Use{" "}
            <code>{CLEAR}</code> to blank a field.
          </p>
        </div>
        <Button variant="outline" onClick={reset} disabled={importing}>
          <RotateCcw className="mr-2 h-4 w-4" /> Clear
        </Button>
      </div>

      <div className="rounded-lg border p-4">
        <Label className="mb-2 flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" /> CSV File
        </Label>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(e) => handleCsv(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
        />
        {csvFile && (
          <p className="mt-2 text-xs text-muted-foreground">
            {csvFile.name} · {rows.length} row(s)
          </p>
        )}
        {parsing && (
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Matching projects…
          </p>
        )}
        {parseError && <p className="mt-2 text-xs text-destructive">{parseError}</p>}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Matched existing projects" value={summary.matched} />
          <Stat label="New projects to create" value={0} />
          <Stat label="Rows to update" value={summary.toUpdate} />
          <Stat label="No changes" value={summary.noChange} />
          <Stat label="Not matched (skipped)" value={summary.unmatched} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Fields to update</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.slug}-${i}`}>
                  <TableCell className="font-mono text-xs">{r.slug || "—"}</TableCell>
                  <TableCell className="text-sm">{r.title || "—"}</TableCell>
                  <TableCell className="max-w-[22rem] text-xs text-muted-foreground">
                    {r.matched ? r.changedFields.join(", ") || "—" : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-amber-600 dark:text-amber-500">
                    {r.warnings.join(" · ")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.status === "success" && (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> {r.message}
                      </span>
                    )}
                    {r.status === "failed" && (
                      <span className="flex items-center gap-1 text-destructive">
                        <XCircle className="h-3 w-3" /> {r.message}
                      </span>
                    )}
                    {r.status === "importing" && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                    {r.status === "skipped" && (
                      <span className="text-muted-foreground">{r.message ?? "Skipped"}</span>
                    )}
                    {r.status === "pending" && (
                      <span className="text-muted-foreground">
                        {r.matched ? "Ready" : "Skipped"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {importing && <Progress value={progress} />}

      {done && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Import complete</p>
          <p className="mt-1 text-muted-foreground">
            Updated {done.updated} · Skipped {done.skipped} · Failed {done.failed} · Created 0
          </p>
        </div>
      )}

      <Button onClick={runImport} disabled={importing || summary.toUpdate === 0}>
        {importing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        Update {summary.toUpdate} project(s)
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

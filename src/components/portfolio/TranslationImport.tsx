import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, RotateCcw, Languages } from "lucide-react";

import { supabase } from "@/lib/supabase";
import type { Client } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* ------------------------------------------------------------------ */
/* CSV helpers (self-contained so the main importer stays untouched)    */
/* ------------------------------------------------------------------ */

export const TRANSLATION_COLUMNS = [
  "slug",
  "title",
  "title_zh",
  "category",
  "category_zh",
  "tag_1",
  "tag_1_zh",
  "tag_2",
  "tag_2_zh",
  "excerpt",
  "excerpt_zh",
  "body_content",
  "body_content_zh",
  "scope_of_work",
  "scope_of_work_zh",
  "key_features",
  "key_features_zh",
  "seo_title",
  "seo_title_zh",
  "seo_description",
  "seo_description_zh",
] as const;

type TCol = (typeof TRANSLATION_COLUMNS)[number];
type TRow = Record<TCol, string>;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
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
    } else if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      cur.push(field);
      field = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      cur.push(field);
      field = "";
      rows.push(cur);
      cur = [];
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function toCsv(rows: (string | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v ?? "";
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
/** Explicit clear token — an empty cell never erases data. */
const isClearToken = (s: string) => /^(\[clear\]|__clear__)$/i.test(s.trim());

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface TaxNode {
  id: string;
  name: string;
  name_zh: string | null;
}

interface ProjectRecord {
  id: string;
  slug: string;
  title: string;
  title_zh: string | null;
  excerpt_zh: string | null;
  body_content_zh: string | null;
  seo_title_zh: string | null;
  seo_description_zh: string | null;
  excerpt: string | null;
  body_content: string | null;
  seo_title: string | null;
  seo_description: string | null;
  sort_order: number | null;
  detail?: {
    content_id: string;
    scope_of_work: string | null;
    key_features: string | null;
    scope_of_work_zh: string | null;
    key_features_zh: string | null;
  };
  category?: TaxNode;
  tag1?: TaxNode;
  tag2?: TaxNode;
}

type RowStatus =
  | "Ready"
  | "No Changes"
  | "Missing Project"
  | "Taxonomy Mismatch"
  | "Conflicting Translation"
  | "Error";

interface PlannedRow {
  data: TRow;
  project?: ProjectRecord;
  status: RowStatus;
  warnings: string[];
  errors: string[];
  contentUpdates: Record<string, string | null>;
  detailUpdates: Record<string, string | null>;
  categoryUpdate?: { id: string; name_zh: string };
  tag1Update?: { id: string; name_zh: string };
  tag2Update?: { id: string; name_zh: string };
  applied?: "updated" | "skipped" | "failed";
  appliedError?: string;
}

const CONTENT_FIELDS: [TCol, string][] = [
  ["title_zh", "title_zh"],
  ["excerpt_zh", "excerpt_zh"],
  ["body_content_zh", "body_content_zh"],
  ["seo_title_zh", "seo_title_zh"],
  ["seo_description_zh", "seo_description_zh"],
];

const DETAIL_FIELDS: [TCol, string][] = [
  ["scope_of_work_zh", "scope_of_work_zh"],
  ["key_features_zh", "key_features_zh"],
];

/* ------------------------------------------------------------------ */

export default function TranslationImport({ client }: { client: Client }) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<TRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [allowClear, setAllowClear] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<null | Record<string, number>>(null);
  const [appliedRows, setAppliedRows] = useState<PlannedRow[] | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  /* ---------------- load existing projects ---------------- */

  const loadProjects = async (): Promise<ProjectRecord[]> => {
    const { data: items, error } = await supabase
      .from("content_items")
      .select(
        "id, slug, title, title_zh, excerpt, excerpt_zh, body_content, body_content_zh, seo_title, seo_title_zh, seo_description, seo_description_zh, sort_order, created_at",
      )
      .eq("client_id", client.id)
      .eq("content_type", "portfolio")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    const list = (items ?? []) as unknown as ProjectRecord[];
    const ids = list.map((i) => i.id);
    if (ids.length === 0) return list;

    const { data: details } = await supabase
      .from("portfolio_details")
      .select("content_id, scope_of_work, key_features, scope_of_work_zh, key_features_zh")
      .in("content_id", ids);
    const detailMap = new Map<string, ProjectRecord["detail"]>();
    (details ?? []).forEach((d) => detailMap.set(d.content_id as string, d as never));

    const { data: cc } = await supabase
      .from("content_categories")
      .select("content_id, categories(id, name, name_zh, client_id)")
      .in("content_id", ids);
    const catMap = new Map<string, TaxNode>();
    ((cc ?? []) as unknown[]).forEach((raw) => {
      const r = raw as {
        content_id: string;
        categories?: (TaxNode & { client_id?: string }) | (TaxNode & { client_id?: string })[] | null;
      };
      const arr = Array.isArray(r.categories) ? r.categories : r.categories ? [r.categories] : [];
      const c = arr.find((x) => x && (!x.client_id || x.client_id === client.id));
      if (c && !catMap.has(r.content_id)) catMap.set(r.content_id, c);
    });

    const { data: ct } = await supabase
      .from("content_tags")
      .select("content_id, tags(id, name, name_zh, tag_level, category_id, parent_tag_id, client_id)")
      .in("content_id", ids);
    const tag1Map = new Map<string, TaxNode & { category_id?: string | null }>();
    const tag2Map = new Map<string, TaxNode & { parent_tag_id?: string | null }>();
    ((ct ?? []) as unknown[]).forEach((raw) => {
      const r = raw as {
        content_id: string;
        tags?: Record<string, unknown> | Record<string, unknown>[] | null;
      };
      const arr = Array.isArray(r.tags) ? r.tags : r.tags ? [r.tags] : [];
      arr.forEach((t) => {
        if (!t) return;
        if (t.client_id && t.client_id !== client.id) return;
        const node = t as unknown as TaxNode & {
          tag_level?: number;
          category_id?: string | null;
          parent_tag_id?: string | null;
        };
        if (node.tag_level === 2) {
          if (!tag2Map.has(r.content_id)) tag2Map.set(r.content_id, node);
        } else if (!tag1Map.has(r.content_id)) {
          tag1Map.set(r.content_id, node);
        }
      });
    });

    return list.map((p) => ({
      ...p,
      detail: detailMap.get(p.id),
      category: catMap.get(p.id),
      tag1: tag1Map.get(p.id),
      tag2: tag2Map.get(p.id),
    }));
  };

  const ensureProjects = async (): Promise<ProjectRecord[]> => {
    if (projects) return projects;
    const list = await loadProjects();
    setProjects(list);
    return list;
  };

  /* ---------------- CSV upload ---------------- */

  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setParseError(null);
    setResult(null);
    setAppliedRows(null);
    setLoading(true);
    try {
      const matrix = parseCsv(await file.text());
      if (matrix.length < 2) throw new Error("CSV has no data rows");
      const header = matrix[0].map((h) => h.trim().toLowerCase().replace(/^\uFEFF/, ""));
      const idx: Partial<Record<TCol, number>> = {};
      TRANSLATION_COLUMNS.forEach((k) => {
        const i = header.indexOf(k);
        if (i >= 0) idx[k] = i;
      });
      if (idx.slug === undefined) {
        throw new Error("CSV must contain a 'slug' column. Download the translation template.");
      }
      const parsed: TRow[] = matrix.slice(1).map((cols) => {
        const row = {} as TRow;
        TRANSLATION_COLUMNS.forEach((k) => {
          const i = idx[k];
          row[k] = i === undefined ? "" : (cols[i] ?? "").trim();
        });
        return row;
      });
      setRawRows(parsed);
      await ensureProjects();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse CSV");
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setCsvFile(null);
    setRawRows([]);
    setParseError(null);
    setResult(null);
    setAppliedRows(null);
    setProgress({ current: 0, total: 0 });
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  /* ---------------- planning ---------------- */

  const planned: PlannedRow[] = useMemo(() => {
    if (!projects) return [];
    const bySlug = new Map(projects.map((p) => [norm(p.slug), p]));

    // conflict detection across rows for the same taxonomy record
    const catZh = new Map<string, Set<string>>();
    const tagZh = new Map<string, Set<string>>();
    rawRows.forEach((r) => {
      const p = bySlug.get(norm(r.slug));
      if (!p) return;
      if (r.category_zh && p.category) {
        const s = catZh.get(p.category.id) ?? new Set();
        s.add(r.category_zh);
        catZh.set(p.category.id, s);
      }
      if (r.tag_1_zh && p.tag1) {
        const s = tagZh.get(p.tag1.id) ?? new Set();
        s.add(r.tag_1_zh);
        tagZh.set(p.tag1.id, s);
      }
      if (r.tag_2_zh && p.tag2) {
        const s = tagZh.get(p.tag2.id) ?? new Set();
        s.add(r.tag_2_zh);
        tagZh.set(p.tag2.id, s);
      }
    });

    const seenSlugs = new Set<string>();

    return rawRows.map<PlannedRow>((data) => {
      const warnings: string[] = [];
      const errors: string[] = [];
      const contentUpdates: Record<string, string | null> = {};
      const detailUpdates: Record<string, string | null> = {};
      let categoryUpdate: PlannedRow["categoryUpdate"];
      let tag1Update: PlannedRow["tag1Update"];
      let tag2Update: PlannedRow["tag2Update"];

      if (!data.slug) {
        return { data, status: "Error", warnings, errors: ["Missing slug"], contentUpdates, detailUpdates };
      }
      if (seenSlugs.has(norm(data.slug))) warnings.push("Duplicate slug in CSV — later row wins");
      seenSlugs.add(norm(data.slug));

      const project = bySlug.get(norm(data.slug));
      if (!project) {
        return {
          data,
          status: "Missing Project",
          warnings,
          errors: [`No portfolio project with slug "${data.slug}" for ${client.client_name}`],
          contentUpdates,
          detailUpdates,
        };
      }

      // English reference columns must not be edited in translation mode
      const refChecks: [TCol, string | null | undefined, string][] = [
        ["title", project.title, "title"],
        ["excerpt", project.excerpt, "excerpt"],
        ["body_content", project.body_content, "body_content"],
        ["seo_title", project.seo_title, "seo_title"],
        ["seo_description", project.seo_description, "seo_description"],
        ["scope_of_work", project.detail?.scope_of_work, "scope_of_work"],
        ["key_features", project.detail?.key_features, "key_features"],
      ];
      refChecks.forEach(([col, existing, label]) => {
        const v = data[col];
        if (v && norm(v) !== norm(existing)) {
          warnings.push(`English ${label} differs from the database — ignored (English is never changed)`);
        }
      });

      const planField = (
        target: Record<string, string | null>,
        column: string,
        incoming: string,
        existing: string | null | undefined,
      ) => {
        if (!incoming) return; // blank never erases
        if (isClearToken(incoming)) {
          if (!allowClear) {
            warnings.push(`${column}: clear requested but "Allow clearing" is off`);
            return;
          }
          if (existing) target[column] = null;
          return;
        }
        if (incoming === (existing ?? "")) return;
        if (existing && !overwrite) {
          warnings.push(`${column}: existing translation kept (enable Overwrite to replace)`);
          return;
        }
        target[column] = incoming;
      };

      CONTENT_FIELDS.forEach(([col, column]) =>
        planField(contentUpdates, column, data[col], project[column as keyof ProjectRecord] as string | null),
      );
      DETAIL_FIELDS.forEach(([col, column]) => {
        if (!project.detail && data[col]) {
          warnings.push(`No portfolio_details row — ${column} skipped`);
          return;
        }
        planField(
          detailUpdates,
          column,
          data[col],
          project.detail?.[column as "scope_of_work_zh" | "key_features_zh"],
        );
      });

      let mismatch = false;

      // --- category ---
      if (data.category_zh) {
        if (!project.category) {
          warnings.push("Project has no assigned Category — category_zh skipped");
        } else if (data.category && norm(data.category) !== norm(project.category.name)) {
          errors.push(
            `Category mismatch: CSV "${data.category}" vs assigned "${project.category.name}"`,
          );
          mismatch = true;
        } else if ((catZh.get(project.category.id)?.size ?? 0) > 1) {
          errors.push(`Conflicting Chinese translations supplied for Category "${project.category.name}"`);
          return {
            data,
            project,
            status: "Conflicting Translation",
            warnings,
            errors,
            contentUpdates,
            detailUpdates,
          };
        } else if (project.category.name_zh && !overwrite) {
          warnings.push("Category translation kept (enable Overwrite to replace)");
        } else if (data.category_zh !== (project.category.name_zh ?? "")) {
          categoryUpdate = { id: project.category.id, name_zh: data.category_zh };
        }
      }

      // --- tag 1 ---
      if (data.tag_1_zh) {
        if (!project.tag1) {
          warnings.push("Project has no assigned Tag 1 — tag_1_zh skipped");
        } else if (data.tag_1 && norm(data.tag_1) !== norm(project.tag1.name)) {
          errors.push(`Tag 1 mismatch: CSV "${data.tag_1}" vs assigned "${project.tag1.name}"`);
          mismatch = true;
        } else if ((tagZh.get(project.tag1.id)?.size ?? 0) > 1) {
          errors.push(`Conflicting Chinese translations supplied for Tag 1 "${project.tag1.name}"`);
          return {
            data,
            project,
            status: "Conflicting Translation",
            warnings,
            errors,
            contentUpdates,
            detailUpdates,
          };
        } else if (project.tag1.name_zh && !overwrite) {
          warnings.push("Tag 1 translation kept (enable Overwrite to replace)");
        } else if (data.tag_1_zh !== (project.tag1.name_zh ?? "")) {
          tag1Update = { id: project.tag1.id, name_zh: data.tag_1_zh };
        }
      }

      // --- tag 2 ---
      if (data.tag_2_zh) {
        if (!project.tag2) {
          warnings.push("Project has no assigned Tag 2 — nothing created, tag_2_zh skipped");
        } else if (data.tag_2 && norm(data.tag_2) !== norm(project.tag2.name)) {
          errors.push(`Tag 2 mismatch: CSV "${data.tag_2}" vs assigned "${project.tag2.name}"`);
          mismatch = true;
        } else if ((tagZh.get(project.tag2.id)?.size ?? 0) > 1) {
          errors.push(`Conflicting Chinese translations supplied for Tag 2 "${project.tag2.name}"`);
          return {
            data,
            project,
            status: "Conflicting Translation",
            warnings,
            errors,
            contentUpdates,
            detailUpdates,
          };
        } else if (project.tag2.name_zh && !overwrite) {
          warnings.push("Tag 2 translation kept (enable Overwrite to replace)");
        } else if (data.tag_2_zh !== (project.tag2.name_zh ?? "")) {
          tag2Update = { id: project.tag2.id, name_zh: data.tag_2_zh };
        }
      }

      const hasChanges =
        Object.keys(contentUpdates).length > 0 ||
        Object.keys(detailUpdates).length > 0 ||
        !!categoryUpdate ||
        !!tag1Update ||
        !!tag2Update;

      const status: RowStatus = mismatch
        ? "Taxonomy Mismatch"
        : hasChanges
          ? "Ready"
          : "No Changes";

      return {
        data,
        project,
        status,
        warnings,
        errors,
        contentUpdates,
        detailUpdates,
        categoryUpdate,
        tag1Update,
        tag2Update,
      };
    });
  }, [rawRows, projects, overwrite, allowClear, client.client_name]);

  const readyRows = planned.filter((r) => r.status === "Ready");

  /* ---------------- apply ---------------- */

  const applyUpdates = async () => {
    if (readyRows.length === 0) return;
    setApplying(true);
    setResult(null);
    setProgress({ current: 0, total: readyRows.length });

    const doneCats = new Set<string>();
    const doneTag1 = new Set<string>();
    const doneTag2 = new Set<string>();
    let matched = 0;
    let projectsUpdated = 0;
    let failed = 0;
    const out: PlannedRow[] = planned.map((r) => ({ ...r }));

    for (let i = 0; i < out.length; i++) {
      const row = out[i];
      if (row.status !== "Ready" || !row.project) continue;
      matched++;
      try {
        if (Object.keys(row.contentUpdates).length > 0) {
          const { error } = await supabase
            .from("content_items")
            .update({ ...row.contentUpdates, updated_at: new Date().toISOString() })
            .eq("id", row.project.id)
            .eq("client_id", client.id);
          if (error) throw error;
        }
        if (Object.keys(row.detailUpdates).length > 0) {
          const { error } = await supabase
            .from("portfolio_details")
            .update({ ...row.detailUpdates, updated_at: new Date().toISOString() })
            .eq("content_id", row.project.id);
          if (error) throw error;
        }
        if (
          Object.keys(row.contentUpdates).length > 0 ||
          Object.keys(row.detailUpdates).length > 0
        ) {
          projectsUpdated++;
        }

        if (row.categoryUpdate && !doneCats.has(row.categoryUpdate.id)) {
          const { error } = await supabase
            .from("categories")
            .update({ name_zh: row.categoryUpdate.name_zh })
            .eq("id", row.categoryUpdate.id)
            .eq("client_id", client.id);
          if (error) throw error;
          doneCats.add(row.categoryUpdate.id);
        }
        if (row.tag1Update && !doneTag1.has(row.tag1Update.id)) {
          const { error } = await supabase
            .from("tags")
            .update({ name_zh: row.tag1Update.name_zh })
            .eq("id", row.tag1Update.id)
            .eq("client_id", client.id);
          if (error) throw error;
          doneTag1.add(row.tag1Update.id);
        }
        if (row.tag2Update && !doneTag2.has(row.tag2Update.id)) {
          const { error } = await supabase
            .from("tags")
            .update({ name_zh: row.tag2Update.name_zh })
            .eq("id", row.tag2Update.id)
            .eq("client_id", client.id);
          if (error) throw error;
          doneTag2.add(row.tag2Update.id);
        }
        row.applied = "updated";
      } catch (err) {
        failed++;
        row.applied = "failed";
        row.appliedError = err instanceof Error ? err.message : "Update failed";
        console.error("[translation-import] row failed", row.data.slug, err);
      }
      setProgress({ current: i + 1, total: out.length });
    }

    setAppliedRows(out);
    setResult({
      matched,
      projectsUpdated,
      categories: doneCats.size,
      tag1: doneTag1.size,
      tag2: doneTag2.size,
      noChanges: planned.filter((r) => r.status === "No Changes").length,
      missing: planned.filter((r) => r.status === "Missing Project").length,
      mismatches: planned.filter((r) => r.status === "Taxonomy Mismatch").length,
      conflicts: planned.filter((r) => r.status === "Conflicting Translation").length,
      failed,
    });
    setApplying(false);
    setProjects(null);
    const refreshed = await loadProjects();
    setProjects(refreshed);
    toast.success(`Translations updated for ${projectsUpdated + doneCats.size + doneTag1.size + doneTag2.size} record(s)`);
  };

  /* ---------------- template download ---------------- */

  const downloadTemplate = async () => {
    setLoading(true);
    try {
      const list = await loadProjects();
      setProjects(list);
      const rows: string[][] = [[...TRANSLATION_COLUMNS]];
      list.forEach((p) => {
        rows.push([
          p.slug ?? "",
          p.title ?? "",
          p.title_zh ?? "",
          p.category?.name ?? "",
          p.category?.name_zh ?? "",
          p.tag1?.name ?? "",
          p.tag1?.name_zh ?? "",
          p.tag2?.name ?? "",
          p.tag2?.name_zh ?? "",
          p.excerpt ?? "",
          p.excerpt_zh ?? "",
          p.body_content ?? "",
          p.body_content_zh ?? "",
          p.detail?.scope_of_work ?? "",
          p.detail?.scope_of_work_zh ?? "",
          p.detail?.key_features ?? "",
          p.detail?.key_features_zh ?? "",
          p.seo_title ?? "",
          p.seo_title_zh ?? "",
          p.seo_description ?? "",
          p.seo_description_zh ?? "",
        ]);
      });
      downloadCsv(toCsv(rows), `translation-template-${Date.now()}.csv`);
      toast.success(`Template exported (${list.length} projects)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  const display = appliedRows ?? planned;

  const statusClass = (s: RowStatus) =>
    s === "Ready"
      ? "text-green-600"
      : s === "No Changes"
        ? "text-muted-foreground"
        : "text-destructive";

  const fieldList = (r: PlannedRow) =>
    [
      ...Object.keys(r.contentUpdates),
      ...Object.keys(r.detailUpdates),
      ...(r.categoryUpdate ? ["categories.name_zh"] : []),
      ...(r.tag1Update ? ["tag_1.name_zh"] : []),
      ...(r.tag2Update ? ["tag_2.name_zh"] : []),
    ].join(", ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Languages className="h-4 w-4" /> Update Translations Only
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Matches existing projects by <code>slug</code> for {client.client_name}. Never creates,
            deletes, or changes English content, images, order or status.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} disabled={applying}>
            <RotateCcw className="mr-2 h-4 w-4" /> Clear
          </Button>
          <Button variant="outline" onClick={downloadTemplate} disabled={loading || applying}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Download Translation Template
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <Label className="mb-2 flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" /> Translation CSV
        </Label>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleCsv}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
        />
        {csvFile && (
          <p className="mt-2 text-xs text-muted-foreground">
            {csvFile.name} · {rawRows.length} row(s)
          </p>
        )}
        {parseError && <p className="mt-2 text-xs text-destructive">{parseError}</p>}

        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
            Overwrite existing translations
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={allowClear} onCheckedChange={(v) => setAllowClear(v === true)} />
            Allow clearing a translation with <code className="mx-1">[CLEAR]</code> in a cell
          </label>
          <p className="text-xs text-muted-foreground">
            Empty cells never erase existing data. English columns in the CSV are reference only.
          </p>
        </div>
      </div>

      {applying && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 text-sm font-medium">
            Updating {progress.current} / {progress.total}
          </div>
          <Progress value={progress.total ? (progress.current / progress.total) * 100 : 0} />
        </div>
      )}

      {display.length > 0 && (
        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
            <p className="text-sm font-medium">
              Preview ({display.length} rows, {readyRows.length} ready)
            </p>
            <Button onClick={applyUpdates} disabled={applying || readyRows.length === 0}>
              {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update {readyRows.length} project(s)
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slug</TableHead>
                  <TableHead>English Title</TableHead>
                  <TableHead>Existing 中文</TableHead>
                  <TableHead>New 中文</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Tag 1</TableHead>
                  <TableHead>Tag 2</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {display.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.data.slug || "—"}</TableCell>
                    <TableCell className="text-xs">{r.project?.title ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.project?.title_zh || "—"}</TableCell>
                    <TableCell className="text-xs">{r.data.title_zh || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.project?.category?.name ?? "—"}
                      <span className="block text-muted-foreground">
                        {r.data.category_zh || r.project?.category?.name_zh || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.project?.tag1?.name ?? "—"}
                      <span className="block text-muted-foreground">
                        {r.data.tag_1_zh || r.project?.tag1?.name_zh || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.project?.tag2?.name ?? "—"}
                      <span className="block text-muted-foreground">
                        {r.data.tag_2_zh || r.project?.tag2?.name_zh || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                      {fieldList(r) || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className={statusClass(r.status)}>
                        {r.applied === "failed" ? "Error" : r.applied === "updated" ? "Updated" : r.status}
                      </span>
                      {r.errors.map((e, j) => (
                        <span key={`e${j}`} className="block text-destructive">
                          {e}
                        </span>
                      ))}
                      {r.appliedError && (
                        <span className="block text-destructive">{r.appliedError}</span>
                      )}
                      {r.warnings.map((w, j) => (
                        <span key={`w${j}`} className="block text-amber-600">
                          {w}
                        </span>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Translation update complete</p>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground md:grid-cols-3">
            <li>Projects matched: {result.matched}</li>
            <li>Project translations updated: {result.projectsUpdated}</li>
            <li>Categories translated: {result.categories}</li>
            <li>Tag 1 records translated: {result.tag1}</li>
            <li>Tag 2 records translated: {result.tag2}</li>
            <li>Rows with no changes: {result.noChanges}</li>
            <li>Missing projects: {result.missing}</li>
            <li>Taxonomy mismatches: {result.mismatches}</li>
            <li>Conflicting translations: {result.conflicts}</li>
            <li className={result.failed ? "text-destructive" : undefined}>
              Failed rows: {result.failed}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

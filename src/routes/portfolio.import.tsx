import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";

import { useClientContext } from "@/contexts/ClientContext";
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
import TranslationImport from "@/components/portfolio/TranslationImport";
import {
  createPortfolio,
  emptyPortfolioForm,
  type PortfolioFormData,
} from "@/lib/portfolio";

export const Route = createFileRoute("/portfolio/import")({
  head: () => ({
    meta: [
      { title: "Bulk Import Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Bulk import portfolio projects + galleries via CSV" },
    ],
  }),
  component: BulkImportPage,
});

/** Every CSV column the importer understands. `title` is the only required one. */
const CSV_COLUMNS = [
  "title", "title_zh", "slug", "excerpt", "excerpt_zh", "body_content", "body_content_zh",
  "status", "is_featured", "sort_order",
  "category", "category_zh", "tag_1", "tag_1_zh", "tag_2", "tag_2_zh",
  "city", "province", "country", "location", "role",
  "project_status", "year_started", "year_completed", "project_year",
  "floor_area_value", "floor_area_unit", "site_area_value", "site_area_unit",
  "units_count", "storeys_count", "parking_spaces", "construction_budget",
  "scope_of_work", "scope_of_work_zh", "key_features", "key_features_zh",
  "services", "live_url",
  "design_architect", "architect_of_record", "interior_designer", "landscape_architect",
  "structural_engineer", "mechanical_engineer", "electrical_engineer", "civil_engineer",
  "other_consultants", "general_contractor", "developer_owner_client", "photographer",
  "other_credits", "awards", "publications",
  "original_website_content", "internal_notes", "image_prefix", "expected_gallery_count",
  "seo_title", "seo_title_zh", "seo_description", "seo_description_zh",
  "image_file",
] as const;

type CsvKey = (typeof CSV_COLUMNS)[number];
type CsvRow = Record<CsvKey, string>;

interface RowState {
  data: CsvRow;
  featuredName: string | null;
  galleryNames: string[];
  imageCount: number;
  error?: string;
  status: "pending" | "importing" | "success" | "failed";
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripExt = (n: string) => (n.lastIndexOf(".") >= 0 ? n.slice(0, n.lastIndexOf(".")) : n);
const extOf = (n: string) =>
  n.lastIndexOf(".") >= 0 ? n.slice(n.lastIndexOf(".") + 1).toLowerCase() : "";

/** webp > jpg/jpeg > png > others when the same basename exists multiple times. */
function dedupePreferWebp(files: File[]): File[] {
  const rank = (name: string) => {
    const e = extOf(name);
    if (e === "webp") return 4;
    if (e === "jpg" || e === "jpeg") return 3;
    if (e === "png") return 2;
    if (e === "gif" || e === "avif") return 1;
    return 0;
  };
  const byBase = new Map<string, File>();
  for (const f of files) {
    const base = stripExt(f.name).toLowerCase();
    const cur = byBase.get(base);
    if (!cur || rank(f.name) > rank(cur.name)) byBase.set(base, f);
  }
  return [...byBase.values()];
}

/**
 * Architect57 image rules for a given prefix P:
 *   P_feature / P_hero  → featured image
 *   P_01 … P_NN         → gallery in numeric order
 *   P                   → fallback featured
 */
function resolveImages(row: CsvRow, deduped: File[]): { featured: File | null; gallery: File[] } {
  const prefix = row.image_prefix?.trim().toLowerCase();
  if (prefix) {
    const featureRe = new RegExp(`^${escapeRegExp(prefix)}[_-](feature|featured|hero|main)$`);
    const numberRe = new RegExp(`^${escapeRegExp(prefix)}[_-](\\d+)$`);
    let featured: File | null = null;
    let exact: File | null = null;
    const numbered: { n: number; f: File }[] = [];
    for (const f of deduped) {
      const base = stripExt(f.name).toLowerCase();
      if (featureRe.test(base)) {
        featured = f;
        continue;
      }
      if (base === prefix) {
        exact = f;
        continue;
      }
      const m = base.match(numberRe);
      if (m) numbered.push({ n: parseInt(m[1], 10), f });
    }
    numbered.sort((a, b) => a.n - b.n);
    let gallery = numbered.map((x) => x.f);
    if (!featured) featured = exact;
    if (!featured && gallery.length) {
      featured = gallery[0];
      gallery = gallery.slice(1);
    }
    return { featured, gallery };
  }
  if (row.image_file) {
    const f = deduped.find((x) => x.name.toLowerCase() === row.image_file.toLowerCase()) ?? null;
    return { featured: f, gallery: [] };
  }
  return { featured: null, gallery: [] };
}

function readImageSize(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve({ width: null, height: null });
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    };
    img.src = url;
  });
}

function splitList(raw: string): string[] {
  return raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** CSV parser supporting quoted fields with commas / newlines / escaped quotes. */
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

/** Map one CSV row onto the shared portfolio form payload. */
function rowToFormData(row: CsvRow, sortOrder: number): PortfolioFormData {
  return {
    ...emptyPortfolioForm(),
    title: row.title,
    title_zh: row.title_zh,
    slug: row.slug || slugify(row.title),
    excerpt: row.excerpt,
    excerpt_zh: row.excerpt_zh,
    body_content: row.body_content,
    body_content_zh: row.body_content_zh,
    status: (["draft", "published", "archived"].includes(row.status)
      ? row.status
      : "published") as PortfolioFormData["status"],
    is_featured: /^(1|true|yes|y)$/i.test(row.is_featured),
    sort_order: Number(row.sort_order) || sortOrder,
    seo_title: row.seo_title,
    seo_title_zh: row.seo_title_zh,
    seo_description: row.seo_description,
    seo_description_zh: row.seo_description_zh,
    live_url: row.live_url,
    services: splitList(row.services),
    project_year: row.project_year,
    short_summary: row.excerpt,
    location: row.location,
    role: row.role,
    city: row.city,
    province: row.province,
    country: row.country,
    project_status: row.project_status,
    year_started: row.year_started,
    year_completed: row.year_completed,
    floor_area_value: row.floor_area_value,
    floor_area_unit: row.floor_area_unit || "sq ft",
    site_area_value: row.site_area_value,
    site_area_unit: row.site_area_unit || "sq ft",
    units_count: row.units_count,
    storeys_count: row.storeys_count,
    parking_spaces: row.parking_spaces,
    construction_budget: row.construction_budget,
    scope_of_work: row.scope_of_work,
    scope_of_work_zh: row.scope_of_work_zh,
    key_features: row.key_features,
    key_features_zh: row.key_features_zh,
    design_architect: row.design_architect,
    architect_of_record: row.architect_of_record,
    interior_designer: row.interior_designer,
    landscape_architect: row.landscape_architect,
    structural_engineer: row.structural_engineer,
    mechanical_engineer: row.mechanical_engineer,
    electrical_engineer: row.electrical_engineer,
    civil_engineer: row.civil_engineer,
    other_consultants: row.other_consultants,
    general_contractor: row.general_contractor,
    developer_owner_client: row.developer_owner_client,
    photographer: row.photographer,
    other_credits: row.other_credits,
    awards: row.awards,
    publications: row.publications,
    original_website_content: row.original_website_content,
    internal_notes: row.internal_notes,
    image_prefix: row.image_prefix,
    expected_gallery_count: row.expected_gallery_count,
  };
}

function BulkImportPage() {
  const { selectedClient } = useClientContext();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"full" | "translations">("full");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [done, setDone] = useState(false);
  const [exporting, setExporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const dedupedFiles = useMemo(() => dedupePreferWebp(imageFiles), [imageFiles]);

  const resetImportState = () => {
    setCsvFile(null);
    setImageFiles([]);
    setRows([]);
    setParseError(null);
    setImporting(false);
    setProgress({ current: 0, total: 0, label: "" });
    setDone(false);
    if (csvInputRef.current) csvInputRef.current.value = "";
    if (imagesInputRef.current) imagesInputRef.current.value = "";
  };

  const reEvaluate = (current: RowState[], deduped: File[]): RowState[] =>
    current.map((r) => {
      const { featured, gallery } = resolveImages(r.data, deduped);
      const expected = parseInt(r.data.expected_gallery_count || "", 10);
      const imageCount = (featured ? 1 : 0) + gallery.length;
      let error = r.data.title ? undefined : "Missing title";
      if (!error && Number.isFinite(expected) && expected > 0 && gallery.length !== expected) {
        error = undefined; // not fatal — surfaced as a warning in the preview
      }
      return {
        ...r,
        featuredName: featured?.name ?? null,
        galleryNames: gallery.map((g) => g.name),
        imageCount,
        error,
      };
    });

  const handleCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setDone(false);
    setParseError(null);
    try {
      const text = await file.text();
      const matrix = parseCsv(text);
      if (matrix.length < 1) throw new Error("CSV is empty");
      const header = matrix[0].map((h) => h.trim().toLowerCase().replace(/^\uFEFF/, ""));
      const idx: Partial<Record<CsvKey, number>> = {};
      CSV_COLUMNS.forEach((k) => {
        const i = header.indexOf(k);
        if (i >= 0) idx[k] = i;
      });
      if (idx.title === undefined) {
        throw new Error(
          "CSV must contain a 'title' column. Download the template for the full column list.",
        );
      }
      const parsed: RowState[] = matrix.slice(1).map((cols) => {
        const data = {} as CsvRow;
        CSV_COLUMNS.forEach((k) => {
          const i = idx[k];
          data[k] = i === undefined ? "" : (cols[i] ?? "").trim();
        });
        return {
          data,
          featuredName: null,
          galleryNames: [],
          imageCount: 0,
          status: "pending" as const,
          error: data.title ? undefined : "Missing title",
        };
      });
      setRows(reEvaluate(parsed, dedupedFiles));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse CSV");
      setRows([]);
    }
  };

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setImageFiles(files);
    const deduped = dedupePreferWebp(files);
    setRows((prev) => reEvaluate(prev, deduped));
    setDone(false);
  };

  // --- taxonomy helpers -------------------------------------------------

  const ensureCategory = async (
    name: string,
    nameZh: string,
    cache: Map<string, string>,
  ): Promise<string | null> => {
    if (!name || !selectedClient) return null;
    const key = `cat:${name.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key)!;
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("client_id", selectedClient.id)
      .eq("category_type", "portfolio")
      .ilike("name", name)
      .limit(1);
    if (existing && existing.length > 0) {
      cache.set(key, existing[0].id);
      return existing[0].id;
    }
    const { data: inserted, error } = await supabase
      .from("categories")
      .insert({
        client_id: selectedClient.id,
        category_type: "portfolio",
        name,
        name_zh: nameZh || null,
        slug: slugify(name) || null,
        sort_order: 0,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    cache.set(key, inserted.id);
    return inserted.id;
  };

  const ensureTag = async (
    name: string,
    nameZh: string,
    level: 1 | 2,
    categoryId: string | null,
    parentTagId: string | null,
    cache: Map<string, string>,
  ): Promise<string | null> => {
    if (!name || !selectedClient) return null;
    const key = `tag${level}:${parentTagId ?? categoryId ?? ""}:${name.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key)!;
    let q = supabase
      .from("tags")
      .select("id")
      .eq("client_id", selectedClient.id)
      .eq("tag_level", level)
      .ilike("name", name);
    q = level === 1 ? q.eq("category_id", categoryId) : q.eq("parent_tag_id", parentTagId);
    const { data: existing } = await q.limit(1);
    if (existing && existing.length > 0) {
      cache.set(key, existing[0].id);
      return existing[0].id;
    }
    const { data: inserted, error } = await supabase
      .from("tags")
      .insert({
        client_id: selectedClient.id,
        name,
        name_zh: nameZh || null,
        slug: slugify(name) || null,
        tag_level: level,
        category_id: categoryId,
        parent_tag_id: level === 2 ? parentTagId : null,
        sort_order: 0,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    cache.set(key, inserted.id);
    return inserted.id;
  };

  const uploadImage = async (file: File): Promise<string> => {
    if (!selectedClient) throw new Error("No client");
    const ext = extOf(file.name) || "png";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${selectedClient.id}/portfolio/${filename}`;
    const { error } = await supabase.storage
      .from("content-images")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    return supabase.storage.from("content-images").getPublicUrl(path).data.publicUrl;
  };

  // --- import -----------------------------------------------------------

  const handleImport = async () => {
    if (!selectedClient) {
      toast.error("Select a client first");
      return;
    }
    if (!csvFile || rows.length === 0) {
      toast.error("Please upload a CSV file.");
      return;
    }
    const needImages = rows.some((r) => r.data.image_prefix || r.data.image_file);
    if (needImages && imageFiles.length === 0) {
      toast.error("Please upload the image files referenced by image_prefix.");
      return;
    }

    setImporting(true);
    setDone(false);
    const taxonomyCache = new Map<string, string>();
    const next = [...rows];

    const { data: maxRow } = await supabase
      .from("content_items")
      .select("sort_order")
      .eq("client_id", selectedClient.id)
      .eq("content_type", "portfolio")
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1);
    const baseSort = (maxRow?.[0]?.sort_order ?? 0) + 1;

    setProgress({ current: 0, total: next.length, label: "" });

    for (let i = 0; i < next.length; i++) {
      const row = next[i];
      setProgress({ current: i, total: next.length, label: row.data.title || `Row ${i + 1}` });
      if (!row.data.title) {
        next[i] = { ...row, status: "failed", error: "Missing title" };
        setRows([...next]);
        continue;
      }
      next[i] = { ...row, status: "importing" };
      setRows([...next]);

      try {
        const { featured, gallery } = resolveImages(row.data, dedupedFiles);

        // 1) featured image
        const featuredUrl = featured ? await uploadImage(featured) : null;

        // 2) content_items + portfolio_details
        const formData = rowToFormData(row.data, baseSort + i);
        if (featuredUrl) formData.featured_image_url = featuredUrl;
        const contentId = await createPortfolio(selectedClient.id, formData);

        // 3) taxonomy: Category → Tag 1 → Tag 2
        const catId = await ensureCategory(row.data.category, row.data.category_zh, taxonomyCache);
        if (catId) {
          await supabase
            .from("content_categories")
            .insert({ content_id: contentId, category_id: catId });
        }
        const tag1Id = await ensureTag(
          row.data.tag_1, row.data.tag_1_zh, 1, catId, null, taxonomyCache,
        );
        if (tag1Id) {
          await supabase.from("content_tags").insert({ content_id: contentId, tag_id: tag1Id });
        }
        if (tag1Id) {
          const tag2Names = splitList(row.data.tag_2);
          const tag2Zh = splitList(row.data.tag_2_zh);
          for (let t = 0; t < tag2Names.length; t++) {
            const tag2Id = await ensureTag(
              tag2Names[t], tag2Zh[t] ?? "", 2, catId, tag1Id, taxonomyCache,
            );
            if (tag2Id) {
              await supabase.from("content_tags").insert({ content_id: contentId, tag_id: tag2Id });
            }
          }
        }

        // 4) media_assets (featured first, then the numbered gallery)
        const assetRows: Record<string, unknown>[] = [];
        if (featured && featuredUrl) {
          const size = await readImageSize(featured);
          assetRows.push({
            client_id: selectedClient.id,
            content_id: contentId,
            file_url: featuredUrl,
            file_type: featured.type || `image/${extOf(featured.name)}`,
            original_filename: featured.name,
            width_px: size.width,
            height_px: size.height,
            alt_text: row.data.title,
            alt_text_zh: row.data.title_zh || null,
            image_credit: row.data.photographer || null,
            is_featured: true,
            sort_order: 0,
          });
        }
        for (let g = 0; g < gallery.length; g++) {
          const gFile = gallery[g];
          const gUrl = await uploadImage(gFile);
          const size = await readImageSize(gFile);
          assetRows.push({
            client_id: selectedClient.id,
            content_id: contentId,
            file_url: gUrl,
            file_type: gFile.type || `image/${extOf(gFile.name)}`,
            original_filename: gFile.name,
            width_px: size.width,
            height_px: size.height,
            alt_text: `${row.data.title} — ${g + 1}`,
            alt_text_zh: row.data.title_zh ? `${row.data.title_zh} — ${g + 1}` : null,
            image_credit: row.data.photographer || null,
            is_featured: false,
            sort_order: g + 1,
          });
        }
        if (assetRows.length > 0) {
          const { error } = await supabase.from("media_assets").insert(assetRows);
          if (error) throw error;
        }

        next[i] = { ...row, status: "success", error: undefined };
      } catch (err) {
        console.error("[import] row failed", row.data.title, err);
        next[i] = {
          ...row,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
      setRows([...next]);
      setProgress({ current: i + 1, total: next.length, label: row.data.title });
    }

    setImporting(false);
    setDone(true);
    qc.invalidateQueries({ queryKey: ["portfolio", selectedClient.id] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats", selectedClient.id] });
    const ok = next.filter((r) => r.status === "success").length;
    const fail = next.filter((r) => r.status === "failed").length;
    toast.success(`Imported ${ok}, failed ${fail}`);
  };

  // --- export -----------------------------------------------------------

  const handleExport = async () => {
    if (!selectedClient) {
      toast.error("Select a client first");
      return;
    }
    setExporting(true);
    try {
      const { data: items, error } = await supabase
        .from("content_items")
        .select("*")
        .eq("client_id", selectedClient.id)
        .eq("content_type", "portfolio")
        .order("sort_order", { ascending: true });
      if (error) throw error;

      const ids = (items ?? []).map((i: { id: string }) => i.id);
      const detailsMap = new Map<string, Record<string, unknown>>();
      const catMap = new Map<string, string[]>();
      const tag1Map = new Map<string, string[]>();
      const tag2Map = new Map<string, string[]>();

      if (ids.length > 0) {
        const { data: details } = await supabase
          .from("portfolio_details")
          .select("*")
          .in("content_id", ids);
        (details ?? []).forEach((d: Record<string, unknown>) => {
          detailsMap.set(d.content_id as string, d);
        });
        const { data: cc } = await supabase
          .from("content_categories")
          .select("content_id, categories(name)")
          .in("content_id", ids);
        ((cc ?? []) as unknown[]).forEach((raw) => {
          const r = raw as { content_id: string; categories?: { name?: string } | { name?: string }[] | null };
          const list = Array.isArray(r.categories) ? r.categories : r.categories ? [r.categories] : [];
          list.forEach((c) => {
            if (!c?.name) return;
            catMap.set(r.content_id, [...(catMap.get(r.content_id) ?? []), c.name]);
          });
        });
        const { data: ct } = await supabase
          .from("content_tags")
          .select("content_id, tags(name, tag_level)")
          .in("content_id", ids);
        ((ct ?? []) as unknown[]).forEach((raw) => {
          const r = raw as {
            content_id: string;
            tags?: { name?: string; tag_level?: number } | { name?: string; tag_level?: number }[] | null;
          };
          const list = Array.isArray(r.tags) ? r.tags : r.tags ? [r.tags] : [];
          list.forEach((t) => {
            if (!t?.name) return;
            const target = t.tag_level === 2 ? tag2Map : tag1Map;
            target.set(r.content_id, [...(target.get(r.content_id) ?? []), t.name]);
          });
        });

      }

      const header = CSV_COLUMNS.filter((c) => c !== "image_file");
      const data: string[][] = [[...header]];
      (items ?? []).forEach((it: Record<string, unknown>) => {
        const d = detailsMap.get(it.id as string) ?? {};
        const pick = (k: string): string => {
          const v = (it[k] ?? d[k]) as unknown;
          if (v === null || v === undefined) return "";
          if (Array.isArray(v)) return v.join("; ");
          return String(v);
        };
        data.push(
          header.map((col) => {
            if (col === "category") return (catMap.get(it.id as string) ?? []).join("; ");
            if (col === "tag_1") return (tag1Map.get(it.id as string) ?? []).join("; ");
            if (col === "tag_2") return (tag2Map.get(it.id as string) ?? []).join("; ");
            if (col === "category_zh" || col === "tag_1_zh" || col === "tag_2_zh") return "";
            return pick(col);
          }),
        );
      });

      downloadCsv(toCsv(data), `${slugify(selectedClient.client_name)}-portfolio-${Date.now()}.csv`);
      toast.success("Export ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = () => {
    const header = CSV_COLUMNS.filter((c) => c !== "image_file");
    const sample: Partial<Record<CsvKey, string>> = {
      title: "Ballatree Rd Residence",
      title_zh: "巴拉樹路住宅",
      status: "published",
      category: "Residential",
      category_zh: "住宅",
      tag_1: "Single Family",
      tag_1_zh: "獨立屋",
      tag_2: "Laneway House; Renovation",
      city: "West Vancouver",
      province: "BC",
      country: "Canada",
      project_status: "Completed",
      year_started: "2019",
      year_completed: "2022",
      project_year: "2022",
      floor_area_value: "4800",
      floor_area_unit: "sq ft",
      storeys_count: "2",
      scope_of_work: "Full architectural design and construction management.",
      services: "Construction Management; Design-Build",
      design_architect: "Architect57",
      general_contractor: "Bluluma Build",
      photographer: "Jane Doe",
      image_prefix: "ballatree-rd",
      expected_gallery_count: "8",
    };
    downloadCsv(
      toCsv([[...header], header.map((h) => sample[h] ?? "")]),
      "portfolio-import-template.csv",
    );
  };

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to bulk import portfolio.</p>
      </div>
    );
  }

  const validRows = rows.filter((r) => !r.error);
  const successCount = rows.filter((r) => r.status === "success").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;

  const modeSwitch = (
    <div className="inline-flex rounded-md border p-1">
      <Button
        size="sm"
        variant={mode === "full" ? "default" : "ghost"}
        onClick={() => setMode("full")}
      >
        Full Import
      </Button>
      <Button
        size="sm"
        variant={mode === "translations" ? "default" : "ghost"}
        onClick={() => setMode("translations")}
      >
        Update Translations Only
      </Button>
    </div>
  );

  if (mode === "translations") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bulk Import Portfolio</h1>
          <div className="mt-3">{modeSwitch}</div>
        </div>
        <TranslationImport client={selectedClient} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {modeSwitch}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bulk Import Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Architect57-compliant CSV + image import for {selectedClient.client_name}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetImportState} disabled={importing}>
            <RotateCcw className="mr-2 h-4 w-4" /> Clear
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <FileText className="mr-2 h-4 w-4" /> CSV Template
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <Label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" /> CSV File
          </Label>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvChange}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
          />
          {csvFile && (
            <p className="mt-2 text-xs text-muted-foreground">
              {csvFile.name} · {rows.length} project(s)
            </p>
          )}
          {parseError && <p className="mt-2 text-xs text-destructive">{parseError}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            Taxonomy columns: <code>category</code> → <code>tag_1</code> → <code>tag_2</code>{" "}
            (semicolon-separated). Unknown columns are ignored.
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <Label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4" /> Images (multiple)
          </Label>
          <input
            ref={imagesInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImagesChange}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
          />
          {imageFiles.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {imageFiles.length} selected · {dedupedFiles.length} after de-duping (webp preferred)
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Matching by <code>image_prefix</code>: <code>{"{prefix}_feature"}</code> = hero,{" "}
            <code>{"{prefix}_01..NN"}</code> = gallery in order.
          </p>
        </div>
      </div>

      {importing && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">
              Importing {progress.current} / {progress.total}
            </span>
            <span className="text-muted-foreground">{progress.label}</span>
          </div>
          <Progress value={progress.total ? (progress.current / progress.total) * 100 : 0} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b p-3">
            <p className="text-sm font-medium">
              Preview ({rows.length} projects, {validRows.length} valid)
            </p>
            <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import {validRows.length} project(s)
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category → Tag 1 → Tag 2</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Images</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => {
                  const expected = parseInt(r.data.expected_gallery_count || "", 10);
                  const mismatch =
                    Number.isFinite(expected) && expected > 0 && r.galleryNames.length !== expected;
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {r.data.title || <span className="text-destructive">—</span>}
                        {r.data.title_zh && (
                          <span className="block text-xs text-muted-foreground">{r.data.title_zh}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {[r.data.category, r.data.tag_1, r.data.tag_2].filter(Boolean).join(" › ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {[r.data.city, r.data.province].filter(Boolean).join(", ") || r.data.location || "—"}
                      </TableCell>
                      <TableCell>
                        {r.data.image_prefix || r.data.image_file ? (
                          r.imageCount > 0 ? (
                            <span
                              className={`inline-flex items-center gap-1 text-xs ${mismatch ? "text-amber-600" : "text-green-600"}`}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {r.featuredName ? "1 hero" : "no hero"} + {r.galleryNames.length} gallery
                              {mismatch ? ` (expected ${expected})` : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-destructive">
                              <XCircle className="h-3 w-3" /> no match for "
                              {r.data.image_prefix || r.data.image_file}"
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">none</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.status === "success" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3 w-3" /> Imported
                          </span>
                        ) : r.status === "importing" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Importing
                          </span>
                        ) : r.status === "failed" ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-destructive"
                            title={r.error}
                          >
                            <XCircle className="h-3 w-3" /> {r.error ?? "Failed"}
                          </span>
                        ) : r.error ? (
                          <span className="text-xs text-destructive">{r.error}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {done && report && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="font-medium">Import complete</p>
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="font-medium">PROJECTS</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>{report.projectsProcessed} processed</li>
                <li>{report.projectsCreated} created</li>
                <li>{report.projectsUpdated} matched existing (images added)</li>
                <li>{report.projectsFailed} failed</li>
                <li>{report.projectsWithWarnings} with warnings</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">IMAGES</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>{report.imagesUploaded} uploaded</li>
                <li>{report.imagesSkipped} already existed</li>
                <li>{report.imagesUnmatched} unmatched</li>
                <li>{report.imagesMissing} missing versus expected counts</li>
                <li>{report.imagesFailed} failed</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">FEATURED IMAGES</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>{report.featuredExplicit} explicit cover images</li>
                <li>{report.featuredFallback} fallback to gallery image 01</li>
                <li>{report.featuredNone} projects without images</li>
              </ul>
            </div>
          </div>

          {report.failures.length > 0 && (
            <div>
              <p className="text-sm font-medium text-destructive">FAILED FILES</p>
              <div className="mt-1 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Filename</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.failures.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{f.project}</TableCell>
                        <TableCell className="text-xs">{f.filename}</TableCell>
                        <TableCell className="text-xs text-destructive">{f.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {failedCount > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {rows
                .filter((r) => r.status === "failed")
                .map((r, i) => (
                  <li key={i}>
                    <strong>{r.data.title || "(no title)"}</strong>: {r.error}
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={resetImportState}>
              <RotateCcw className="mr-2 h-4 w-4" /> Import Another CSV
            </Button>
            <Link to="/portfolio">
              <Button>View All Portfolio</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

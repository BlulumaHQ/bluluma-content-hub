import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import GalleryUpdateImport from "@/components/portfolio/GalleryUpdateImport";
import MetadataUpdateImport from "@/components/portfolio/MetadataUpdateImport";
import {
  createPortfolio,
  emptyPortfolioForm,
  portfolioFormFrom,
  updatePortfolio,
  type PortfolioFormData,
} from "@/lib/portfolio";
import { extOf, readImageSize, removeStoredFile, uploadPortfolioImage } from "@/lib/media";
import {
  dedupePreferWebp,
  isSupportedImage,
  matchPrefix,
  readZipImages,
  usedNames,
  type NamedImage,
} from "@/lib/import-images";
import { getPortfolioFieldDefinitions } from "@/lib/field-definitions";
import {
  CORE_KEYS,
  importDynamicSaveInput,
  slugifyTitle,
} from "@/lib/portfolio-import-mapping";
import { validateImport, type ValidatedRow } from "@/lib/portfolio-import-validation";
import type { PortfolioItem } from "@/types";

export const Route = createFileRoute("/_cms/portfolio/import")({
  head: () => ({
    meta: [
      { title: "Bulk Import Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Bulk import portfolio projects + galleries via CSV" },
      { property: "og:title", content: "Bulk Import Portfolio — Bluluma CMS Admin" },
      { property: "og:description", content: "Bulk import portfolio projects + galleries via CSV" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BulkImportPage,
});

interface ImportFailure {
  project: string;
  filename: string;
  reason: string;
}

interface ImportReport {
  projectsProcessed: number;
  projectsCreated: number;
  projectsUpdated: number;
  projectsFailed: number;
  imagesUploaded: number;
  imagesSkipped: number;
  imagesUnmatched: number;
  imagesFailed: number;
  failures: ImportFailure[];
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

const bool = (v: string) => /^(1|true|yes|y)$/i.test(v.trim());

/**
 * Apply only NON-EMPTY spreadsheet values on top of a base form. A blank cell
 * never erases an existing value in this importer mode.
 */
function applyCoreToForm(
  base: PortfolioFormData,
  core: Record<string, string>,
  slug: string,
  fallbackSort: number,
): PortfolioFormData {
  const out: PortfolioFormData = { ...base, slug };
  const set = (key: keyof PortfolioFormData, value: string) => {
    if (value.trim() === "") return;
    (out as unknown as Record<string, unknown>)[key] = value.trim();
  };

  set("title", core.title);
  set("title_zh", core.title_zh);
  set("excerpt", core.excerpt);
  set("excerpt_zh", core.excerpt_zh);
  set("body_content", core.body_content);
  set("body_content_zh", core.body_content_zh);
  set("seo_title", core.seo_title);
  set("seo_title_zh", core.seo_title_zh);
  set("seo_description", core.seo_description);
  set("seo_description_zh", core.seo_description_zh);
  set("live_url", core.live_url);
  set("project_year", core.project_year);
  set("location", core.location);
  set("role", core.role);
  set("city", core.city);
  set("province", core.province);
  set("country", core.country);
  set("project_status", core.project_status);
  set("year_started", core.year_started);
  set("year_completed", core.year_completed);
  set("floor_area_value", core.floor_area_value);
  set("floor_area_unit", core.floor_area_unit);
  set("site_area_value", core.site_area_value);
  set("site_area_unit", core.site_area_unit);
  set("units_count", core.units_count);
  set("storeys_count", core.storeys_count);
  set("parking_spaces", core.parking_spaces);
  set("construction_budget", core.construction_budget);
  set("scope_of_work", core.scope_of_work);
  set("scope_of_work_zh", core.scope_of_work_zh);
  set("key_features", core.key_features);
  set("key_features_zh", core.key_features_zh);
  set("design_architect", core.design_architect);
  set("architect_of_record", core.architect_of_record);
  set("interior_designer", core.interior_designer);
  set("landscape_architect", core.landscape_architect);
  set("structural_engineer", core.structural_engineer);
  set("mechanical_engineer", core.mechanical_engineer);
  set("electrical_engineer", core.electrical_engineer);
  set("civil_engineer", core.civil_engineer);
  set("other_consultants", core.other_consultants);
  set("general_contractor", core.general_contractor);
  set("developer_owner_client", core.developer_owner_client);
  set("photographer", core.photographer);
  set("other_credits", core.other_credits);
  set("awards", core.awards);
  set("publications", core.publications);
  set("original_website_content", core.original_website_content);
  set("internal_notes", core.internal_notes);
  set("image_prefix", core.image_prefix);
  set("expected_gallery_count", core.expected_gallery_count);

  if (core.excerpt?.trim() && !base.short_summary) out.short_summary = core.excerpt.trim();
  if (core.services?.trim()) out.services = splitList(core.services);
  if (core.status?.trim() && ["draft", "published", "archived"].includes(core.status.trim()))
    out.status = core.status.trim() as PortfolioFormData["status"];
  else if (!base.title) out.status = "published";
  if (core.is_featured?.trim()) out.is_featured = bool(core.is_featured);
  const sort = Number(core.sort_order);
  out.sort_order = Number.isFinite(sort) && sort > 0 ? sort : base.sort_order || fallbackSort;
  return out;
}

function BulkImportPage() {
  const { selectedClient } = useClientContext();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"full" | "gallery" | "metadata" | "translations">("full");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [images, setImages] = useState<NamedImage[]>([]);
  const [readingZip, setReadingZip] = useState(false);
  const [replaceGallery, setReplaceGallery] = useState(false);
  const [strict, setStrict] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [rowStatus, setRowStatus] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [exporting, setExporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const { data: definitions = [] } = useQuery({
    queryKey: ["portfolio-field-definitions", selectedClient?.id],
    queryFn: () => getPortfolioFieldDefinitions(selectedClient),
    enabled: !!selectedClient,
  });

  const { data: existingSlugList = [] } = useQuery({
    queryKey: ["portfolio-slugs", selectedClient?.id],
    enabled: !!selectedClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_items")
        .select("slug")
        .eq("client_id", selectedClient!.id)
        .eq("content_type", "portfolio");
      if (error) throw error;
      return (data ?? []).map((d) => String((d as { slug: string }).slug));
    },
  });

  const dedupedImages = useMemo(() => dedupePreferWebp(images), [images]);

  const prefixOf = (cols: string[], idx: number | undefined) =>
    idx === undefined ? "" : (cols[idx] ?? "").trim();

  // --- dry run: parse → map → validate (NO writes) ------------------------
  const validation = useMemo(() => {
    if (headers.length === 0) return null;
    const first = validateImport({
      headers,
      dataRows,
      definitions,
      existingSlugs: new Set(existingSlugList),
      strict,
      clientName: selectedClient?.client_name,
    });
    const prefixIdx = first.mapping.coreIndex["image_prefix"];
    const galleryCounts = new Map<number, number>();
    dataRows.forEach((cols, i) => {
      const prefix = prefixOf(cols, prefixIdx);
      if (!prefix) return;
      galleryCounts.set(i, matchPrefix(prefix, dedupedImages).gallery.length);
    });
    return validateImport({
      headers,
      dataRows,
      definitions,
      existingSlugs: new Set(existingSlugList),
      strict,
      galleryCounts,
      clientName: selectedClient?.client_name,
    });
  }, [headers, dataRows, definitions, existingSlugList, strict, dedupedImages, selectedClient]);


  const unmatchedNames = useMemo(() => {
    if (dedupedImages.length === 0 || !validation) return [];
    const prefixIdx = validation.mapping.coreIndex["image_prefix"];
    const matches = dataRows
      .map((cols) => prefixOf(cols, prefixIdx))
      .filter(Boolean)
      .map((p) => matchPrefix(p, dedupedImages));
    const used = usedNames(matches);
    return dedupedImages.filter((img) => !used.has(img.name)).map((img) => img.name);
  }, [dedupedImages, dataRows, validation]);

  const resetImportState = () => {
    setCsvFile(null);
    setHeaders([]);
    setDataRows([]);
    setImages([]);
    setParseError(null);
    setImporting(false);
    setProgress({ current: 0, total: 0, label: "" });
    setRowStatus({});
    setDone(false);
    setReport(null);
    if (csvInputRef.current) csvInputRef.current.value = "";
    if (imagesInputRef.current) imagesInputRef.current.value = "";
  };

  const handleCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setDone(false);
    setRowStatus({});
    setParseError(null);
    try {
      const matrix = parseCsv(await file.text());
      if (matrix.length < 2) throw new Error("CSV needs a header row and at least one data row.");
      setHeaders(matrix[0]);
      setDataRows(matrix.slice(1));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse CSV");
      setHeaders([]);
      setDataRows([]);
    }
  };

  const handleImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setDone(false);
    setReadingZip(true);
    try {
      const collected: NamedImage[] = [];
      for (const f of files) {
        if (f.name.toLowerCase().endsWith(".zip")) {
          collected.push(...(await readZipImages(f)));
        } else if (isSupportedImage(f.name)) {
          collected.push({ name: f.name, file: f });
        }
      }
      setImages(collected);
      if (collected.length === 0 && files.length > 0) {
        toast.error("No supported images found (.jpg, .jpeg, .png, .webp).");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read images");
    } finally {
      setReadingZip(false);
    }
  };

  // --- taxonomy helpers -------------------------------------------------

  const ensureCategory = async (
    name: string,
    nameZh: string,
    cache: Map<string, string>,
  ): Promise<string | null> => {
    if (!name.trim() || !selectedClient) return null;
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
        slug: slugifyTitle(name) || null,
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
    if (!name.trim() || !selectedClient) return null;
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
        slug: slugifyTitle(name) || null,
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

  // --- commit -----------------------------------------------------------

  const handleImport = async () => {
    if (!selectedClient || !validation) return;
    if (!validation.canCommit) {
      toast.error("Resolve all errors before committing the import.");
      return;
    }
    const rows = validation.rows;
    const prefixIdx = validation.mapping.coreIndex["image_prefix"];

    setImporting(true);
    setDone(false);
    setReport(null);
    const taxonomyCache = new Map<string, string>();
    const rep: ImportReport = {
      projectsProcessed: 0,
      projectsCreated: 0,
      projectsUpdated: 0,
      projectsFailed: 0,
      imagesUploaded: 0,
      imagesSkipped: 0,
      imagesUnmatched: unmatchedNames.length,
      imagesFailed: 0,
      failures: [],
    };

    const { data: maxRow } = await supabase
      .from("content_items")
      .select("sort_order")
      .eq("client_id", selectedClient.id)
      .eq("content_type", "portfolio")
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1);
    const baseSort = (maxRow?.[0]?.sort_order ?? 0) + 1;

    setProgress({ current: 0, total: rows.length, label: "" });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const core = row.mapped.core;
      setProgress({ current: i, total: rows.length, label: row.title });
      setRowStatus((s) => ({ ...s, [row.rowNumber]: "importing" }));
      rep.projectsProcessed++;

      try {
        const prefix = prefixOf(dataRows[i] ?? [], prefixIdx);
        const match = prefix
          ? matchPrefix(prefix, dedupedImages)
          : { cover: null, coverIsGalleryFirst: false, gallery: [] as NamedImage[] };
        const ordered: { img: NamedImage; featured: boolean }[] = [];
        if (match.cover) ordered.push({ img: match.cover, featured: true });
        for (const g of match.gallery) {
          if (match.cover && g.name === match.cover.name) continue;
          ordered.push({ img: g, featured: false });
        }

        const dynamic = importDynamicSaveInput(row.mapped);

        // 1) find or create/update the project (client + slug)
        const { data: existingItem } = await supabase
          .from("content_items")
          .select("*")
          .eq("client_id", selectedClient.id)
          .eq("content_type", "portfolio")
          .eq("slug", row.matchSlug)
          .limit(1)
          .maybeSingle();

        let contentId: string;
        let created = false;
        if (existingItem?.id) {
          contentId = existingItem.id as string;
          const { data: details } = await supabase
            .from("portfolio_details")
            .select("*")
            .eq("content_id", contentId)
            .maybeSingle();
          const base = portfolioFormFrom({
            ...(existingItem as unknown as PortfolioItem),
            portfolio_details: (details ?? undefined) as PortfolioItem["portfolio_details"],
          });
          // never rewrite an existing project's slug
          const formData = applyCoreToForm(base, core, row.matchSlug, baseSort + i);
          await updatePortfolio(contentId, selectedClient.id, formData, dynamic);
          rep.projectsUpdated++;

        } else {
          const formData = applyCoreToForm(
            emptyPortfolioForm(),
            core,
            row.slug,
            baseSort + i,
          );
          contentId = await createPortfolio(selectedClient.id, formData, dynamic);
          created = true;
          rep.projectsCreated++;
        }

        // 2) taxonomy for newly created projects
        if (created) {
          const catId = await ensureCategory(core.category, core.category_zh, taxonomyCache);
          if (catId) {
            await supabase
              .from("content_categories")
              .insert({ content_id: contentId, category_id: catId });
          }
          const tag1Id = await ensureTag(core.tag_1, core.tag_1_zh, 1, catId, null, taxonomyCache);
          if (tag1Id) {
            await supabase.from("content_tags").insert({ content_id: contentId, tag_id: tag1Id });
            const tag2Names = splitList(core.tag_2);
            const tag2Zh = splitList(core.tag_2_zh);
            for (let t = 0; t < tag2Names.length; t++) {
              const tag2Id = await ensureTag(
                tag2Names[t],
                tag2Zh[t] ?? "",
                2,
                catId,
                tag1Id,
                taxonomyCache,
              );
              if (tag2Id) {
                await supabase
                  .from("content_tags")
                  .insert({ content_id: contentId, tag_id: tag2Id });
              }
            }
          }
        }

        // 3) gallery (unchanged image architecture)
        if (replaceGallery) {
          const { data: old } = await supabase
            .from("media_assets")
            .select("id, file_url")
            .eq("content_id", contentId);
          for (const o of old ?? []) {
            await removeStoredFile((o as { file_url: string }).file_url);
          }
          await supabase.from("media_assets").delete().eq("content_id", contentId);
        }
        const { data: existingAssets } = await supabase
          .from("media_assets")
          .select("original_filename, sort_order")
          .eq("content_id", contentId);
        const existingNames = new Set(
          (existingAssets ?? [])
            .map((a) => (a as { original_filename: string | null }).original_filename)
            .filter(Boolean)
            .map((n) => (n as string).toLowerCase()),
        );
        let sortCursor =
          (existingAssets ?? []).reduce(
            (max, a) => Math.max(max, (a as { sort_order: number | null }).sort_order ?? 0),
            0,
          ) + 1;

        let featuredUrl: string | null = null;
        for (const entry of ordered) {
          if (existingNames.has(entry.img.name.toLowerCase())) {
            rep.imagesSkipped++;
            continue;
          }
          try {
            const url = await uploadPortfolioImage(selectedClient.id, entry.img.file);
            const size = await readImageSize(entry.img.file);
            const { error: insErr } = await supabase.from("media_assets").insert({
              client_id: selectedClient.id,
              content_id: contentId,
              file_url: url,
              file_type: entry.img.file.type || `image/${extOf(entry.img.name)}`,
              original_filename: entry.img.name,
              width_px: size.width,
              height_px: size.height,
              alt_text: row.title,
              alt_text_zh: core.title_zh || null,
              image_credit: core.photographer || null,
              is_featured: entry.featured,
              sort_order: entry.featured ? 0 : sortCursor++,
            });
            if (insErr) throw insErr;
            if (entry.featured) featuredUrl = url;
            rep.imagesUploaded++;
          } catch (imgErr) {
            rep.imagesFailed++;
            rep.failures.push({
              project: row.title,
              filename: entry.img.name,
              reason: imgErr instanceof Error ? imgErr.message : "Upload failed",
            });
          }
        }

        if (featuredUrl) {
          await supabase
            .from("content_items")
            .update({ featured_image_url: featuredUrl })
            .eq("id", contentId);
        }

        setRowStatus((s) => ({ ...s, [row.rowNumber]: "success" }));
      } catch (err) {
        console.error("[import] row failed", row.title, err);
        rep.projectsFailed++;
        rep.failures.push({
          project: row.title,
          filename: "—",
          reason: err instanceof Error ? err.message : "Unknown error",
        });
        setRowStatus((s) => ({
          ...s,
          [row.rowNumber]: err instanceof Error ? err.message : "failed",
        }));
      }
      setProgress({ current: i + 1, total: rows.length, label: row.title });
    }

    setImporting(false);
    setReport(rep);
    setDone(true);
    qc.invalidateQueries({ queryKey: ["portfolio", selectedClient.id] });
    qc.invalidateQueries({ queryKey: ["portfolio-slugs", selectedClient.id] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats", selectedClient.id] });
    toast.success(
      `Imported ${rep.projectsCreated + rep.projectsUpdated} project(s), ${rep.imagesUploaded} image(s)`,
    );
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
          const r = raw as {
            content_id: string;
            categories?: { name?: string } | { name?: string }[] | null;
          };
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
            tags?:
              | { name?: string; tag_level?: number }
              | { name?: string; tag_level?: number }[]
              | null;
          };
          const list = Array.isArray(r.tags) ? r.tags : r.tags ? [r.tags] : [];
          list.forEach((t) => {
            if (!t?.name) return;
            const target = t.tag_level === 2 ? tag2Map : tag1Map;
            target.set(r.content_id, [...(target.get(r.content_id) ?? []), t.name]);
          });
        });
      }

      const dynamicHeaders = definitions.flatMap((d) =>
        (Array.isArray(d.source_columns) ? d.source_columns : []).map(String),
      );
      const header = [...CORE_KEYS.filter((c) => c !== "image_file"), ...dynamicHeaders];
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
            if (!CORE_KEYS.includes(col)) return "";
            return pick(col);
          }),
        );
      });

      downloadCsv(
        toCsv(data),
        `${slugifyTitle(selectedClient.client_name)}-portfolio-${Date.now()}.csv`,
      );
      toast.success("Export ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = () => {
    const dynamicHeaders = definitions.flatMap((d) =>
      (Array.isArray(d.source_columns) ? d.source_columns : []).map(String),
    );
    const header = [...CORE_KEYS.filter((c) => c !== "image_file"), ...dynamicHeaders];
    const sample: Record<string, string> = {
      title: "Ballatree Rd Residence",
      title_zh: "巴拉樹路住宅",
      slug: "ballatree-rd-residence",
      status: "published",
      category: "Residential",
      tag_1: "Single Family",
      tag_2: "Laneway House; Renovation",
      city: "West Vancouver",
      province: "BC",
      country: "Canada",
      project_status: "Completed",
      year_completed: "2022",
      services: "Construction Management; Design-Build",
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

  const modeSwitch = (
    <div className="inline-flex rounded-md border p-1">
      <Button size="sm" variant={mode === "full" ? "default" : "ghost"} onClick={() => setMode("full")}>
        Full Import
      </Button>
      <Button
        size="sm"
        variant={mode === "gallery" ? "default" : "ghost"}
        onClick={() => setMode("gallery")}
      >
        Update Existing Projects Only
      </Button>
      <Button
        size="sm"
        variant={mode === "metadata" ? "default" : "ghost"}
        onClick={() => setMode("metadata")}
      >
        Update Existing Project Metadata
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

  if (mode === "translations" || mode === "gallery" || mode === "metadata") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bulk Import Portfolio</h1>
          <div className="mt-3">{modeSwitch}</div>
        </div>
        {mode === "gallery" ? (
          <GalleryUpdateImport client={selectedClient} />
        ) : mode === "metadata" ? (
          <MetadataUpdateImport client={selectedClient} />
        ) : (
          <TranslationImport client={selectedClient} />
        )}
      </div>
    );
  }

  const totals = validation?.totals;

  return (
    <div className="space-y-6">
      {modeSwitch}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bulk Import Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Definition-driven CSV + image import for {selectedClient.client_name} ·{" "}
            {definitions.length} active dynamic field definition(s).
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
            <FileText className="h-4 w-4" /> 1. CSV File
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
              {csvFile.name} · {dataRows.length} row(s) · {headers.length} column(s)
            </p>
          )}
          {parseError && <p className="mt-2 text-xs text-destructive">{parseError}</p>}
          <label className="mt-3 flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => setStrict(e.target.checked)}
              disabled={importing}
            />
            Strict Spreadsheet Validation (any populated unmapped column blocks the import)
          </label>
        </div>

        <div className="rounded-lg border p-4">
          <Label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4" /> 2. Images (ZIP or multiple files)
          </Label>
          <input
            ref={imagesInputRef}
            type="file"
            accept=".zip,application/zip,image/*"
            multiple
            onChange={handleImagesChange}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
          />
          {readingZip && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Reading ZIP…
            </p>
          )}
          {images.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {images.length} image(s) · {dedupedImages.length} after de-duping (webp preferred)
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Naming: <code>{"{image_prefix}-cover.jpg"}</code> = featured,{" "}
            <code>{"{image_prefix}-01.jpg … -NN.jpg"}</code> = gallery in numeric order.
          </p>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={replaceGallery}
              onChange={(e) => setReplaceGallery(e.target.checked)}
            />
            Replace existing gallery for matched projects (destructive)
          </label>
        </div>
      </div>

      {validation && (
        <div className="rounded-lg border">
          <div className="border-b p-3">
            <p className="text-sm font-medium">3. Column Mapping Report</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Every column resolves to a destination or is reported as an error.
            </p>
          </div>
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validation.mapping.columns.map((c) => (
                  <TableRow key={`${c.index}-${c.header}`}>
                    <TableCell className="text-xs font-medium">{c.header || "(blank)"}</TableCell>
                    <TableCell className="text-xs">{c.type}</TableCell>
                    <TableCell className="font-mono text-xs">{c.destination}</TableCell>
                    <TableCell className="text-xs">
                      {c.status === "mapped" ? (
                        <span className="text-emerald-600">
                          Mapped{c.note ? ` · ${c.note}` : ""}
                        </span>
                      ) : (
                        <span className="text-destructive">ERROR: Unmapped</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {validation && validation.columnIssues.length > 0 && (
        <ul className="rounded-lg border border-destructive/40 p-4 text-xs text-destructive">
          {validation.columnIssues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}

      {unmatchedNames.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 p-4">
          <p className="text-sm font-medium text-amber-600">
            UNMATCHED IMAGES ({unmatchedNames.length})
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground md:grid-cols-3">
            {unmatchedNames.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

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

      {validation && totals && (
        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
            <div className="text-sm">
              <p className="font-medium">4. Dry Run Preview — no data has been written yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Rows {totals.rows} · New {totals.create} · Updates {totals.update} ·{" "}
                <span className={totals.errors ? "text-destructive" : ""}>
                  Errors {totals.errors}
                </span>{" "}
                · <span className="text-amber-600">Warnings {totals.warnings}</span>
              </p>
            </div>
            <Button onClick={handleImport} disabled={importing || !validation.canCommit}>
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Commit Import
            </Button>
          </div>
          {!validation.canCommit && (
            <p className="border-b p-3 text-xs text-destructive">
              Commit is blocked while errors exist{strict ? " (strict validation is ON)" : ""}.
            </p>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Category › Tag 1 › Tag 2</TableHead>
                  <TableHead>Specs</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validation.rows.map((r: ValidatedRow) => (
                  <TableRow key={r.rowNumber}>
                    <TableCell className="text-xs uppercase">
                      {r.action === "invalid" ? (
                        <span className="text-destructive">Blocked</span>
                      ) : r.action === "update" ? (
                        "Update"
                      ) : (
                        "Create"
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{r.title || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.slug || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {[r.category, r.tag1, r.tag2].filter(Boolean).join(" › ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.mapped.specificationCount}</TableCell>
                    <TableCell className="text-xs">{r.mapped.creditCount}</TableCell>
                    <TableCell className="max-w-[26rem] space-y-1 text-xs">
                      {r.issues.map((issue, i) => (
                        <div
                          key={i}
                          className={
                            issue.severity === "error"
                              ? "text-destructive"
                              : issue.severity === "warning"
                                ? "text-amber-600"
                                : "text-muted-foreground"
                          }
                        >
                          {issue.severity.toUpperCase()}: {issue.message}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="text-xs">
                      {rowStatus[r.rowNumber] === "success" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Imported
                        </span>
                      ) : rowStatus[r.rowNumber] === "importing" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : rowStatus[r.rowNumber] ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-3 w-3" /> {rowStatus[r.rowNumber]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Pending</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {done && report && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="font-medium">Import complete</p>
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="font-medium">PROJECTS</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>{report.projectsProcessed} processed</li>
                <li>{report.projectsCreated} created</li>
                <li>{report.projectsUpdated} updated</li>
                <li>{report.projectsFailed} failed</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">IMAGES</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>{report.imagesUploaded} uploaded</li>
                <li>{report.imagesSkipped} already existed</li>
                <li>{report.imagesUnmatched} unmatched</li>
                <li>{report.imagesFailed} failed</li>
              </ul>
            </div>
          </div>

          {report.failures.length > 0 && (
            <div>
              <p className="text-sm font-medium text-destructive">FAILURES</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {report.failures.map((f, i) => (
                  <li key={i}>
                    <strong>{f.project}</strong> · {f.filename} — {f.reason}
                  </li>
                ))}
              </ul>
            </div>
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileText, Image as ImageIcon, Loader2, CheckCircle2, XCircle, RotateCcw } from "lucide-react";

import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/portfolio/import")({
  head: () => ({
    meta: [
      { title: "Bulk Import Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Bulk import portfolio items + galleries via CSV" },
    ],
  }),
  component: BulkImportPage,
});

interface CsvRow {
  title: string;
  category: string;
  location: string;
  role: string;
  services: string; // raw, ";"-separated within the cell
  website_url: string;
  description: string;
  image_prefix: string; // gallery: collects {prefix}_feature + {prefix}_NN
  image_file: string; // single-image fallback (backward compatible)
}

interface RowState extends CsvRow {
  featuredName: string | null;
  galleryNames: string[];
  imageCount: number;
  error?: string;
  status: "pending" | "success" | "failed";
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

// Prefer webp > jpg/jpeg > png > anything else when the same basename
// exists in multiple formats. Lets the user select both .jpg and .webp.
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

// Resolve the featured image + ordered gallery for a row from the deduped files.
function resolveImages(
  row: CsvRow,
  deduped: File[],
): { featured: File | null; gallery: File[] } {
  if (row.image_prefix) {
    const p = row.image_prefix.toLowerCase();
    const featureRe = new RegExp(`^${escapeRegExp(p)}_feature$`);
    const numberRe = new RegExp(`^${escapeRegExp(p)}_(\\d+)$`);
    let featured: File | null = null;
    let exact: File | null = null;
    const numbered: { n: number; f: File }[] = [];
    for (const f of deduped) {
      const base = stripExt(f.name).toLowerCase();
      if (featureRe.test(base)) {
        featured = f;
        continue;
      }
      if (base === p) {
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

function parseServices(raw: string): string[] | null {
  if (!raw) return null;
  const arr = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

// Simple CSV parser supporting quoted fields with commas and escaped quotes ("")
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
    } else {
      if (ch === '"') {
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
        if (ch === "\r" && text[i + 1] === "\n") i += 2;
        else i++;
      } else {
        field += ch;
        i++;
      }
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
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\n");
}

function BulkImportPage() {
  const { selectedClient } = useClientContext();
  const qc = useQueryClient();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [exporting, setExporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const resetImportState = () => {
    setCsvFile(null);
    setImageFiles([]);
    setRows([]);
    setParseError(null);
    setImporting(false);
    setDone(false);
    if (csvInputRef.current) csvInputRef.current.value = "";
    if (imagesInputRef.current) imagesInputRef.current.value = "";
  };

  const dedupedFiles = useMemo(() => dedupePreferWebp(imageFiles), [imageFiles]);

  const reEvaluate = (current: RowState[], deduped: File[]) =>
    current.map((r) => {
      const { featured, gallery } = resolveImages(r, deduped);
      return {
        ...r,
        featuredName: featured ? featured.name : null,
        galleryNames: gallery.map((g) => g.name),
        imageCount: (featured ? 1 : 0) + gallery.length,
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
      const header = matrix[0].map((h) => h.trim().toLowerCase());
      const known = [
        "title",
        "category",
        "location",
        "role",
        "services",
        "website_url",
        "description",
        "image_prefix",
        "image_file",
      ];
      const idx: Record<string, number> = {};
      known.forEach((k) => {
        idx[k] = header.indexOf(k);
      });
      if (idx.title < 0)
        throw new Error(
          "CSV must contain a 'title' column. Recognized headers: " + known.join(", "),
        );
      const parsed: RowState[] = matrix.slice(1).map((cols) => {
        const get = (k: string) => (idx[k] >= 0 ? (cols[idx[k]] ?? "").trim() : "");
        const r: RowState = {
          title: get("title"),
          category: get("category"),
          location: get("location"),
          role: get("role"),
          services: get("services"),
          website_url: get("website_url"),
          description: get("description"),
          image_prefix: get("image_prefix"),
          image_file: get("image_file"),
          featuredName: null,
          galleryNames: [],
          imageCount: 0,
          status: "pending",
        };
        if (!r.title) r.error = "Missing title";
        return r;
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

  const ensureCategory = async (
    name: string,
    cache: Map<string, string>,
  ): Promise<string | null> => {
    if (!name || !selectedClient) return null;
    const key = name.toLowerCase();
    if (cache.has(key)) return cache.get(key)!;
    const { data: existing, error: selErr } = await supabase
      .from("categories")
      .select("id, name")
      .eq("client_id", selectedClient.id)
      .eq("category_type", "portfolio")
      .ilike("name", name)
      .limit(1);
    if (selErr) throw selErr;
    if (existing && existing.length > 0) {
      cache.set(key, existing[0].id);
      return existing[0].id;
    }
    const { data: inserted, error: insErr } = await supabase
      .from("categories")
      .insert({
        client_id: selectedClient.id,
        category_type: "portfolio",
        name,
        slug: slugify(name) || null,
        sort_order: 0,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    cache.set(key, inserted.id);
    return inserted.id;
  };

  const uploadImage = async (file: File): Promise<string> => {
    if (!selectedClient) throw new Error("No client");
    const ext = extOf(file.name) || "png";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${selectedClient.id}/portfolio/${filename}`;
    const { error: upErr } = await supabase.storage
      .from("content-images")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from("content-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleImport = async () => {
    if (!selectedClient) {
      toast.error("Select a client first");
      return;
    }
    if (!csvFile || rows.length === 0) {
      toast.error("Please upload a CSV file.");
      return;
    }
    const needImages = rows.some((r) => r.image_prefix || r.image_file);
    if (needImages && imageFiles.length === 0) {
      toast.error("Please upload image files.");
      return;
    }
    setImporting(true);
    setDone(false);
    const categoryCache = new Map<string, string>();
    const next = [...rows];
    let baseSort = 0;
    {
      const { data: maxRow } = await supabase
        .from("content_items")
        .select("sort_order")
        .eq("client_id", selectedClient.id)
        .eq("content_type", "portfolio")
        .order("sort_order", { ascending: false })
        .limit(1);
      baseSort = (maxRow?.[0]?.sort_order ?? 0) + 1;
    }

    for (let i = 0; i < next.length; i++) {
      const row = next[i];
      if (!row.title) {
        next[i] = { ...row, status: "failed", error: "Missing title" };
        setRows([...next]);
        continue;
      }
      try {
        const { featured, gallery } = resolveImages(row, dedupedFiles);

        // 1) Upload featured (hero) image
        let featuredUrl: string | null = null;
        if (featured) featuredUrl = await uploadImage(featured);

        // 2) Create the content item
        const { data: created, error: cErr } = await supabase
          .from("content_items")
          .insert({
            client_id: selectedClient.id,
            content_type: "portfolio",
            title: row.title,
            slug: slugify(row.title) || `item-${Date.now()}-${i}`,
            excerpt: row.description || null,
            body_content: null,
            featured_image_url: featuredUrl,
            status: "published",
            is_featured: false,
            sort_order: baseSort + i,
          })
          .select("id")
          .single();
        if (cErr) throw cErr;

        // 3) Portfolio details (live_url + construction-style fields)
        const { error: dErr } = await supabase.from("portfolio_details").insert({
          content_id: created.id,
          live_url: row.website_url || null,
          services: parseServices(row.services),
          client_name: row.title,
          project_year: null,
          short_summary: row.description || null,
          location: row.location || null,
          role: row.role || null,
        });
        if (dErr) throw dErr;

        // 4) Gallery -> media_assets (featured first, then thumbnails)
        const assetRows: Record<string, unknown>[] = [];
        if (featured && featuredUrl) {
          assetRows.push({
            client_id: selectedClient.id,
            content_id: created.id,
            file_url: featuredUrl,
            file_type: featured.type || `image/${extOf(featured.name)}`,
            alt_text: row.title,
            is_featured: true,
            sort_order: 0,
          });
        }
        for (let g = 0; g < gallery.length; g++) {
          const gFile = gallery[g];
          const gUrl = await uploadImage(gFile);
          assetRows.push({
            client_id: selectedClient.id,
            content_id: created.id,
            file_url: gUrl,
            file_type: gFile.type || `image/${extOf(gFile.name)}`,
            alt_text: `${row.title} — ${g + 1}`,
            is_featured: false,
            sort_order: g + 1,
          });
        }
        if (assetRows.length > 0) {
          const { error: mErr } = await supabase.from("media_assets").insert(assetRows);
          if (mErr) throw mErr;
        }

        // 5) Category link
        if (row.category) {
          try {
            const catId = await ensureCategory(row.category, categoryCache);
            if (catId) {
              await supabase
                .from("content_categories")
                .insert({ content_id: created.id, category_id: catId });
            }
          } catch (catErr) {
            console.error("Category link failed", catErr);
          }
        }

        next[i] = { ...row, status: "success", error: undefined };
      } catch (err) {
        next[i] = {
          ...row,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
      setRows([...next]);
    }

    setImporting(false);
    setDone(true);
    qc.invalidateQueries({ queryKey: ["portfolio", selectedClient.id] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats", selectedClient.id] });
    const ok = next.filter((r) => r.status === "success").length;
    const fail = next.filter((r) => r.status === "failed").length;
    toast.success(`Imported ${ok}, failed ${fail}`);
  };

  const handleExport = async () => {
    if (!selectedClient) {
      toast.error("Select a client first");
      return;
    }
    setExporting(true);
    try {
      const { data: items, error } = await supabase
        .from("content_items")
        .select("id, title, featured_image_url, excerpt")
        .eq("client_id", selectedClient.id)
        .eq("content_type", "portfolio")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const ids = (items ?? []).map((i) => i.id);
      const detailsMap = new Map<
        string,
        { live_url: string | null; short_summary: string | null; location: string | null; role: string | null; services: string[] | null }
      >();
      const catMap = new Map<string, string[]>();
      if (ids.length > 0) {
        const { data: details } = await supabase
          .from("portfolio_details")
          .select("content_id, live_url, short_summary, location, role, services")
          .in("content_id", ids);
        (details ?? []).forEach((d: any) => {
          detailsMap.set(d.content_id, {
            live_url: d.live_url,
            short_summary: d.short_summary,
            location: d.location,
            role: d.role,
            services: d.services,
          });
        });
        const { data: cc } = await supabase
          .from("content_categories")
          .select("content_id, categories(name)")
          .in("content_id", ids);
        (cc ?? []).forEach((row: any) => {
          const name = row.categories?.name;
          if (!name) return;
          const arr = catMap.get(row.content_id) ?? [];
          arr.push(name);
          catMap.set(row.content_id, arr);
        });
      }

      const header = [
        "title",
        "category",
        "location",
        "role",
        "services",
        "website_url",
        "description",
        "featured_image_url",
      ];
      const data: string[][] = [header];
      (items ?? []).forEach((it: any) => {
        const d = detailsMap.get(it.id);
        data.push([
          it.title ?? "",
          (catMap.get(it.id) ?? []).join("; "),
          d?.location ?? "",
          d?.role ?? "",
          (d?.services ?? []).join("; "),
          d?.live_url ?? "",
          it.excerpt ?? d?.short_summary ?? "",
          it.featured_image_url ?? "",
        ]);
      });
      const csv = toCsv(data);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(selectedClient.client_name)}-portfolio-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Export ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = toCsv([
      ["title", "category", "location", "role", "services", "website_url", "description", "image_prefix"],
      [
        "Ballatree Rd Residence",
        "Residential (single family)",
        "West Vancouver, BC",
        "Construction Manager",
        "Construction Management; Design-Build",
        "",
        "Custom single-family home with full construction management.",
        "ballatree-rd",
      ],
      [
        "Friendly Dental",
        "Dental / Healthcare",
        "Richmond, BC",
        "",
        "",
        "https://friendlydental.ca",
        "Modern dental clinic website.",
        "friendly-dental",
      ],
    ]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portfolio-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bulk Import Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Import multiple portfolio items + galleries for {selectedClient.client_name} via CSV + images.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetImportState} disabled={importing}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <FileText className="mr-2 h-4 w-4" />
            CSV Template
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
              {csvFile.name} · {rows.length} row(s)
            </p>
          )}
          {parseError && <p className="mt-2 text-xs text-destructive">{parseError}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            Columns: title, category, location, role, services, website_url, description, image_prefix
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
            Gallery is collected by <code>image_prefix</code>: <code>{"{prefix}_feature"}</code> = hero,{" "}
            <code>{"{prefix}_01..NN"}</code> = thumbnails.
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b p-3">
            <p className="text-sm font-medium">
              Preview ({rows.length} rows, {validRows.length} valid)
            </p>
            <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import {validRows.length} item(s)
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Images</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">
                    {r.title || <span className="text-destructive">—</span>}
                  </TableCell>
                  <TableCell>{r.category || "—"}</TableCell>
                  <TableCell className="text-xs">{r.location || "—"}</TableCell>
                  <TableCell>
                    {r.image_prefix || r.image_file ? (
                      r.imageCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          {r.featuredName ? "1 hero" : "no hero"} + {r.galleryNames.length} gallery
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive">
                          <XCircle className="h-3 w-3" /> no match for "{r.image_prefix || r.image_file}"
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {done && (
        <div className="rounded-lg border p-4">
          <p className="font-medium">Import complete</p>
          <p className="mt-1 text-sm text-green-600">Successfully imported: {successCount}</p>
          <p className="text-sm text-destructive">Failed: {failedCount}</p>
          {failedCount > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
              {rows
                .filter((r) => r.status === "failed")
                .map((r, i) => (
                  <li key={i}>
                    <strong>{r.title || "(no title)"}</strong>: {r.error}
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={resetImportState}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Import Another CSV
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

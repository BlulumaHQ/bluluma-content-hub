import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Upload,
  XCircle,
} from "lucide-react";

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
import { extOf, readImageSize, removeStoredFile, uploadPortfolioImage } from "@/lib/media";
import {
  dedupePreferWebp,
  isSupportedImage,
  matchPrefix,
  readZipImages,
  type NamedImage,
} from "@/lib/import-images";
import type { Client, MediaAsset } from "@/types";

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

interface Row {
  title: string;
  slug: string;
  imagePrefix: string;
  expected: number | null;
  /** resolved after lookup */
  contentId: string | null;
  matched: boolean;
  galleryNames: string[];
  duplicateNames: string[];
  warnings: string[];
  status: "pending" | "importing" | "success" | "skipped" | "failed";
  message?: string;
  uploaded: number;
}

export default function GalleryUpdateImport({ client }: { client: Client }) {
  const qc = useQueryClient();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [images, setImages] = useState<NamedImage[]>([]);
  const [readingZip, setReadingZip] = useState(false);
  const [replaceGallery, setReplaceGallery] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [done, setDone] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const deduped = useMemo(() => dedupePreferWebp(images), [images]);

  const reset = () => {
    setCsvFile(null);
    setRows([]);
    setImages([]);
    setParseError(null);
    setDone(false);
    setProgress({ current: 0, total: 0, label: "" });
    if (csvRef.current) csvRef.current.value = "";
    if (imgRef.current) imgRef.current.value = "";
  };

  /** Look up matching projects + existing gallery filenames, then recompute preview. */
  const evaluate = async (base: Row[], imgs: NamedImage[]) => {
    if (base.length === 0) {
      setRows([]);
      return;
    }
    setChecking(true);
    try {
      const slugs = base.map((r) => r.slug).filter(Boolean);
      const { data: items, error } = await supabase
        .from("content_items")
        .select("id, slug")
        .eq("client_id", client.id)
        .eq("content_type", "portfolio")
        .in("slug", slugs.length ? slugs : ["__none__"]);
      if (error) throw error;
      const bySlug = new Map<string, string>();
      (items ?? []).forEach((it: { id: string; slug: string }) => bySlug.set(it.slug, it.id));

      const ids = [...bySlug.values()];
      const existingByContent = new Map<string, Set<string>>();
      if (ids.length > 0) {
        const { data: assets } = await supabase
          .from("media_assets")
          .select("content_id, original_filename, file_url")
          .in("content_id", ids);
        (assets ?? []).forEach((a: Partial<MediaAsset>) => {
          const cid = a.content_id as string;
          const set = existingByContent.get(cid) ?? new Set<string>();
          if (a.original_filename) set.add(a.original_filename.toLowerCase());
          existingByContent.set(cid, set);
        });
      }

      const next = base.map((r) => {
        const contentId = r.slug ? (bySlug.get(r.slug) ?? null) : null;
        const prefix = r.imagePrefix || r.slug;
        const match = prefix
          ? matchPrefix(prefix, imgs)
          : { cover: null, coverIsGalleryFirst: false, gallery: [] as NamedImage[] };
        const gallery = match.gallery.map((g) => g.name);
        const existing = contentId ? (existingByContent.get(contentId) ?? new Set<string>()) : new Set<string>();
        const duplicates = replaceGallery
          ? []
          : gallery.filter((n) => existing.has(n.toLowerCase()));
        const warnings: string[] = [];
        if (contentId && gallery.length === 0) warnings.push(`No gallery images match prefix "${prefix}"`);
        if (r.expected && gallery.length !== r.expected)
          warnings.push(`Expected ${r.expected} gallery images, found ${gallery.length}`);
        return {
          ...r,
          contentId,
          matched: !!contentId,
          galleryNames: gallery,
          duplicateNames: duplicates,
          warnings,
          status: (contentId ? "pending" : "skipped") as Row["status"],
          message: contentId ? undefined : "NOT MATCHED — SKIPPED",
          uploaded: 0,
        };
      });
      setRows(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setChecking(false);
    }
  };

  const handleCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setDone(false);
    setParseError(null);
    try {
      const matrix = parseCsv(await file.text());
      if (matrix.length < 2) throw new Error("CSV has no data rows");
      const header = matrix[0].map((h) => h.trim().toLowerCase().replace(/^\uFEFF/, ""));
      const col = (name: string) => header.indexOf(name);
      const iTitle = col("title");
      const iSlug = col("slug");
      const iPrefix = col("image_prefix");
      const iExpected = col("expected_gallery_count");
      if (iSlug < 0 && iTitle < 0)
        throw new Error("CSV must contain a 'slug' (or 'title') column");
      const base: Row[] = matrix.slice(1).map((cols) => {
        const get = (i: number) => (i >= 0 ? (cols[i] ?? "").trim() : "");
        const title = get(iTitle);
        const slug = get(iSlug) || slugify(title);
        const expectedNum = parseInt(get(iExpected), 10);
        return {
          title: title || slug,
          slug,
          imagePrefix: get(iPrefix),
          expected: Number.isFinite(expectedNum) && expectedNum > 0 ? expectedNum : null,
          contentId: null,
          matched: false,
          galleryNames: [],
          duplicateNames: [],
          warnings: [],
          status: "pending" as const,
          uploaded: 0,
        };
      });
      await evaluate(base, deduped);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse CSV");
      setRows([]);
    }
  };

  const handleImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setDone(false);
    setReadingZip(true);
    try {
      const collected: NamedImage[] = [];
      for (const f of files) {
        if (f.name.toLowerCase().endsWith(".zip")) collected.push(...(await readZipImages(f)));
        else if (isSupportedImage(f.name)) collected.push({ name: f.name, file: f });
      }
      setImages(collected);
      if (collected.length === 0 && files.length > 0)
        toast.error("No supported images found (.jpg, .jpeg, .png, .webp).");
      await evaluate(rows, dedupePreferWebp(collected));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read images");
    } finally {
      setReadingZip(false);
    }
  };

  const toggleReplace = async (checked: boolean) => {
    if (checked) {
      const ok = window.confirm(
        "DESTRUCTIVE: existing gallery images of matched projects will be deleted before import. Featured/Hero images and the projects themselves are preserved. Continue?",
      );
      if (!ok) return;
    }
    setReplaceGallery(checked);
    // Recompute duplicates against the new setting.
    const base = rows.map((r) => ({ ...r }));
    setTimeout(() => void evaluate(base, deduped), 0);
  };

  const summary = useMemo(() => {
    const matched = rows.filter((r) => r.matched).length;
    const notMatched = rows.length - matched;
    const galleryFound = rows.reduce((n, r) => n + (r.matched ? r.galleryNames.length : 0), 0);
    const duplicates = rows.reduce((n, r) => n + r.duplicateNames.length, 0);
    const warnings = rows.reduce((n, r) => n + r.warnings.length, 0);
    return {
      matched,
      notMatched,
      toCreate: 0,
      galleryFound,
      duplicates,
      warnings,
      toUpload: galleryFound - duplicates,
    };
  }, [rows]);

  const runImport = async () => {
    const targets = rows.filter((r) => r.matched && r.contentId);
    if (targets.length === 0) {
      toast.error("No existing projects matched — nothing to update.");
      return;
    }
    setImporting(true);
    setDone(false);
    const next = [...rows];
    let uploadedTotal = 0;
    let skippedTotal = 0;
    let failedTotal = 0;
    setProgress({ current: 0, total: next.length, label: "" });

    for (let i = 0; i < next.length; i++) {
      const row = next[i];
      if (!row.matched || !row.contentId) {
        next[i] = { ...row, status: "skipped", message: "NOT MATCHED — SKIPPED" };
        setRows([...next]);
        setProgress({ current: i + 1, total: next.length, label: row.title });
        continue;
      }
      next[i] = { ...row, status: "importing" };
      setRows([...next]);
      const contentId = row.contentId;
      try {
        // Existing assets for duplicate detection / optional replacement.
        const { data: existingAssets } = await supabase
          .from("media_assets")
          .select("id, original_filename, file_url, is_featured, sort_order")
          .eq("content_id", contentId);
        const assets = (existingAssets ?? []) as MediaAsset[];

        if (replaceGallery) {
          // Delete gallery media only — never the featured/hero asset, never the project.
          const removable = assets.filter((a) => !a.is_featured);
          for (const a of removable) {
            await removeStoredFile(a.file_url);
          }
          if (removable.length > 0) {
            await supabase
              .from("media_assets")
              .delete()
              .in(
                "id",
                removable.map((a) => a.id),
              );
          }
        }

        const remaining = replaceGallery ? assets.filter((a) => a.is_featured) : assets;
        const existingNames = new Set(
          remaining.map((a) => (a.original_filename ?? "").toLowerCase()).filter(Boolean),
        );
        let cursor = remaining.reduce((m, a) => Math.max(m, a.sort_order ?? 0), 0);

        const prefix = row.imagePrefix || row.slug;
        const match = matchPrefix(prefix, deduped);
        // Only explicitly numbered gallery files; never a -cover / hero file.
        const gallery = match.gallery;
        let uploaded = 0;

        for (let g = 0; g < gallery.length; g++) {
          const img = gallery[g];
          if (existingNames.has(img.name.toLowerCase())) {
            skippedTotal++;
            continue;
          }
          try {
            const url = await uploadPortfolioImage(client.id, img.file);
            const size = await readImageSize(img.file);
            const { error: insErr } = await supabase.from("media_assets").insert({
              client_id: client.id,
              content_id: contentId,
              file_url: url,
              file_type: img.file.type || `image/${extOf(img.name)}`,
              original_filename: img.name,
              width_px: size.width,
              height_px: size.height,
              alt_text: row.title,
              is_featured: false,
              sort_order: replaceGallery ? g + 1 : ++cursor,
            });
            if (insErr) throw insErr;
            existingNames.add(img.name.toLowerCase());
            uploaded++;
            uploadedTotal++;
          } catch (imgErr) {
            failedTotal++;
            console.error("[gallery-update] image failed", img.name, imgErr);
          }
        }

        next[i] = {
          ...next[i],
          status: "success",
          uploaded,
          message: `${uploaded} added${row.duplicateNames.length ? `, ${row.duplicateNames.length} duplicate(s) skipped` : ""}`,
        };
      } catch (err) {
        failedTotal++;
        next[i] = {
          ...next[i],
          status: "failed",
          message: err instanceof Error ? err.message : "Update failed",
        };
      }
      setRows([...next]);
      setProgress({ current: i + 1, total: next.length, label: row.title });
    }

    setImporting(false);
    setDone(true);
    qc.invalidateQueries({ queryKey: ["portfolio", client.id] });
    toast.success(
      `Updated ${targets.length} project(s) · ${uploadedTotal} image(s) added, ${skippedTotal} duplicate(s) skipped${failedTotal ? `, ${failedTotal} failed` : ""}`,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Update Existing Projects Only</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Adds gallery images to projects that already exist for {client.client_name}. No new
            projects are created; titles, taxonomy, SEO and featured images are never changed.
          </p>
        </div>
        <Button variant="outline" onClick={reset} disabled={importing}>
          <RotateCcw className="mr-2 h-4 w-4" /> Clear
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <Label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" /> CSV File
          </Label>
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsv}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
          />
          {csvFile && (
            <p className="mt-2 text-xs text-muted-foreground">
              {csvFile.name} · {rows.length} row(s)
            </p>
          )}
          {parseError && <p className="mt-2 text-xs text-destructive">{parseError}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            Uses <code>title</code>, <code>slug</code>, <code>image_prefix</code>,{" "}
            <code>expected_gallery_count</code>. All other columns are ignored.
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <Label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4" /> Gallery Images (ZIP or multiple files)
          </Label>
          <input
            ref={imgRef}
            type="file"
            accept=".zip,application/zip,image/*"
            multiple
            onChange={handleImages}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
          />
          {readingZip && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Reading ZIP…
            </p>
          )}
          {images.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {images.length} image(s) · {deduped.length} after de-duping (webp preferred)
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Naming: <code>{"{image_prefix}-01.webp … -NN.webp"}</code>. The numeric suffix becomes{" "}
            <code>sort_order</code>. <code>-cover</code> files are ignored here — featured images
            are never replaced.
          </p>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={replaceGallery}
              onChange={(e) => void toggleReplace(e.target.checked)}
            />
            Replace existing gallery for matched projects (destructive)
          </label>
          {replaceGallery && (
            <p className="mt-1 text-xs text-destructive">
              Gallery media for matched projects will be deleted first. Projects and featured images
              are preserved.
            </p>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border p-4 text-sm">
          <div className="mb-2 flex items-center gap-2 font-medium">
            Preview{checking && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-3">
            <li>Existing Projects Matched: <strong>{summary.matched}</strong></li>
            <li className={summary.notMatched ? "text-amber-600" : ""}>
              Not Matched: <strong>{summary.notMatched}</strong>
            </li>
            <li>New Projects To Create: <strong>0</strong></li>
            <li>Gallery Images Found: <strong>{summary.galleryFound}</strong></li>
            <li>Duplicates To Skip: <strong>{summary.duplicates}</strong></li>
            <li className={summary.warnings ? "text-amber-600" : ""}>
              Warnings: <strong>{summary.warnings}</strong>
            </li>
          </ul>
        </div>
      )}

      {importing && (
        <div className="rounded-lg border p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">
              Updating {progress.current} / {progress.total}
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
              {rows.length} row(s) · {summary.matched} matched · {summary.toUpload} image(s) to add
            </p>
            <Button
              onClick={runImport}
              disabled={importing || checking || summary.matched === 0 || summary.toUpload <= 0}
            >
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Update {summary.matched} project gallery(ies)
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Gallery Images</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={`${r.slug}-${idx}`}>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.slug || "—"}</TableCell>
                    <TableCell className="align-top text-xs">
                      {r.matched ? (
                        <div className="space-y-1">
                          <div className={r.galleryNames.length ? "text-green-600" : "text-destructive"}>
                            Found: {r.galleryNames.length}
                            {r.expected ? ` / ${r.expected}` : ""}
                          </div>
                          {r.duplicateNames.length > 0 && (
                            <div className="text-amber-600">
                              SKIP DUPLICATE: {r.duplicateNames.length}
                            </div>
                          )}
                          {r.galleryNames.length > 0 && (
                            <ul className="text-muted-foreground">
                              {r.galleryNames.map((n, gi) => (
                                <li key={n}>
                                  {String(gi + 1).padStart(2, "0")} {n}
                                </li>
                              ))}
                            </ul>
                          )}
                          {r.warnings.map((w) => (
                            <div key={w} className="text-amber-600">
                              WARNING: {w}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-3 w-3" /> {r.message ?? "Updated"}
                        </span>
                      ) : r.status === "importing" ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Updating
                        </span>
                      ) : r.status === "failed" ? (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-3 w-3" /> {r.message}
                        </span>
                      ) : r.status === "skipped" ? (
                        <span className="text-amber-600">NOT MATCHED — SKIPPED</span>
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

      {done && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Update complete</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No projects were created or deleted. Featured images were left untouched.
          </p>
        </div>
      )}
    </div>
  );
}

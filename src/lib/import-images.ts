import JSZip from "jszip";

import { IMAGE_EXTS, extOf, stripExt } from "@/lib/media";

export interface NamedImage {
  /** Original filename as authored (no folder path). */
  name: string;
  file: File;
}

export interface PrefixMatch {
  cover: NamedImage | null;
  /** true when the cover is also gallery #1 (fallback, no explicit -cover file). */
  coverIsGalleryFirst: boolean;
  gallery: NamedImage[];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const isSupportedImage = (name: string) => IMAGE_EXTS.includes(extOf(name));

/** Read every supported image out of a ZIP, ignoring folders and OS junk. */
export async function readZipImages(zipFile: File): Promise<NamedImage[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const out: NamedImage[] = [];
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  for (const entry of entries) {
    const name = entry.name.split("/").pop()?.trim() ?? "";
    if (!name || name.startsWith(".") || entry.name.includes("__MACOSX")) continue;
    if (!isSupportedImage(name)) continue;
    const blob = await entry.async("blob");
    const ext = extOf(name);
    const type = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    out.push({ name, file: new File([blob], name, { type }) });
  }
  return out;
}

/** webp > jpg/jpeg > png > others when the same basename appears twice. */
export function dedupePreferWebp(images: NamedImage[]): NamedImage[] {
  const rank = (name: string) => {
    const e = extOf(name);
    if (e === "webp") return 4;
    if (e === "jpg" || e === "jpeg") return 3;
    if (e === "png") return 2;
    return 1;
  };
  const byBase = new Map<string, NamedImage>();
  for (const img of images) {
    const base = stripExt(img.name).trim().toLowerCase();
    const cur = byBase.get(base);
    if (!cur || rank(img.name) > rank(cur.name)) byBase.set(base, img);
  }
  return [...byBase.values()];
}

/**
 * Match images to one `image_prefix`.
 *   {prefix}-cover.ext                 → featured / cover
 *   {prefix}-01.ext … {prefix}-NN.ext  → gallery, numeric order
 * Separator may be `-` or `_`; extensions are case-insensitive. The prefix must
 * end on a real boundary, so `project-10-01.jpg` never matches `project-1`.
 */
export function matchPrefix(prefix: string, images: NamedImage[]): PrefixMatch {
  const p = prefix.trim().toLowerCase();
  if (!p) return { cover: null, coverIsGalleryFirst: false, gallery: [] };

  const coverRe = new RegExp(`^${escapeRegExp(p)}[-_](cover|feature|featured|hero|main)$`);
  const numRe = new RegExp(`^${escapeRegExp(p)}[-_](\\d+)$`);

  let cover: NamedImage | null = null;
  let exact: NamedImage | null = null;
  const numbered: { n: number; img: NamedImage }[] = [];

  for (const img of images) {
    const base = stripExt(img.name).trim().toLowerCase();
    if (coverRe.test(base)) {
      cover = img;
      continue;
    }
    if (base === p) {
      exact = img;
      continue;
    }
    const m = base.match(numRe);
    if (m) numbered.push({ n: parseInt(m[1], 10), img });
  }

  numbered.sort((a, b) => a.n - b.n); // numeric, not alphabetical
  const gallery = numbered.map((x) => x.img);

  if (!cover && exact) return { cover: exact, coverIsGalleryFirst: false, gallery };
  if (!cover && gallery.length > 0) {
    // Fallback: gallery image 01 doubles as the cover — never duplicated.
    return { cover: gallery[0], coverIsGalleryFirst: true, gallery };
  }
  return { cover, coverIsGalleryFirst: false, gallery };
}

/** Every filename referenced by any prefix match, for unmatched-file reporting. */
export function usedNames(matches: PrefixMatch[]): Set<string> {
  const used = new Set<string>();
  for (const m of matches) {
    if (m.cover) used.add(m.cover.name);
    m.gallery.forEach((g) => used.add(g.name));
  }
  return used;
}

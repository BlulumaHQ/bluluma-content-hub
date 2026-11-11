import type { ContentItem } from "@/types";

export const PORTFOLIO_WEBSITES = [
  { value: "bluluma", label: "BluLuma" },
  { value: "sonykun", label: "SonyKun" },
  { value: "swiftlift", label: "SwiftLift" },
] as const;

export const DEFAULT_PORTFOLIO_SERVICES = [
  "Website Design", "Logo Design", "Branding", "Marketing Materials", "SEO",
];
export const SCREENSHOT_TYPES = ["page_screenshot", "mobile_screenshot"];

export function toggleSelection(values: string[], value: string, checked: boolean) {
  return checked ? [...new Set([...values, value])] : values.filter((v) => v !== value);
}

export function addCustomService(values: string[], input: string) {
  const value = input.trim();
  if (!value || values.some((v) => v.toLowerCase() === value.toLowerCase())) return values;
  return [...values, value];
}

export function filterPortfolioTab<T extends Pick<ContentItem, "content_type" | "status">>(items: T[], status: "draft" | "published") {
  return items.filter((item) => item.content_type === "portfolio" && item.status === status);
}

export function safeWebsiteUrl(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}
export type ShowOnMode = "set" | "add" | "remove";
const WEBSITE_VALUES = PORTFOLIO_WEBSITES.map((w) => w.value as string);

export function applyShowOn(current: string[] | null | undefined, picked: string[], mode: ShowOnMode) {
  const cur = current ?? [];
  const next = mode === "set" ? picked : mode === "add" ? [...cur, ...picked] : cur.filter((v) => !picked.includes(v));
  const unique = [...new Set(next)];
  return [...WEBSITE_VALUES.filter((v) => unique.includes(v)), ...unique.filter((v) => !WEBSITE_VALUES.includes(v))];
}

export function showOnAfterPublish(current: string[] | null | undefined) {
  return current && current.length > 0 ? current : ["bluluma"];
}

/** Toggle a pending featured change; drops the entry when it matches the saved value. */
export function togglePendingFeatured(pending: Map<string, boolean>, id: string, saved: boolean) {
  const next = new Map(pending);
  const target = !(pending.has(id) ? pending.get(id)! : saved);
  if (target === saved) next.delete(id); else next.set(id, target);
  return next;
}

export function splitFeaturedChanges(pending: Map<string, boolean>) {
  const on: string[] = [], off: string[] = [];
  pending.forEach((v, id) => (v ? on : off).push(id));
  return { on, off };
}

export function countFeatured(items: { id: string; is_featured: boolean }[], pending: Map<string, boolean>) {
  return items.filter((i) => (pending.has(i.id) ? pending.get(i.id) : i.is_featured)).length;
}

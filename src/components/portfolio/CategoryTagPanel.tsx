import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Check } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category, Tag } from "@/types";

interface CategoryTagPanelProps {
  contentId: string;
  clientId: string;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Strict 3-level taxonomy assignment:
 *   Category  →  Tag 1 (tag_level 1, scoped to the category)
 *             →  Tag 2 (tag_level 2, scoped to the chosen Tag 1)
 *
 * Category and Tag 1 are single-select; Tag 2 is multi-select.
 * Everything is client-scoped and persisted immediately.
 */
export function CategoryTagPanel({ contentId, clientId }: CategoryTagPanelProps) {
  const [cats, setCats] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tag1Id, setTag1Id] = useState<string | null>(null);
  const [tag2Ids, setTag2Ids] = useState<Set<string>>(new Set());
  const [newCat, setNewCat] = useState("");
  const [newTag1, setNewTag1] = useState("");
  const [newTag2, setNewTag2] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: catRows }, { data: tagRows }, { data: cc }, { data: ct }] = await Promise.all([
        supabase
          .from("categories")
          .select("*")
          .eq("client_id", clientId)
          .eq("category_type", "portfolio")
          .order("sort_order", { ascending: true }),
        supabase
          .from("tags")
          .select("*")
          .eq("client_id", clientId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase.from("content_categories").select("category_id").eq("content_id", contentId),
        supabase.from("content_tags").select("tag_id").eq("content_id", contentId),
      ]);

      const allTags = (tagRows as Tag[]) ?? [];
      setCats((catRows as Category[]) ?? []);
      setTags(allTags);

      const assignedCat = (cc ?? [])[0]?.category_id ?? null;
      setCategoryId(assignedCat);

      const assignedTagIds = new Set((ct ?? []).map((r: { tag_id: string }) => r.tag_id));
      const assigned = allTags.filter((t) => assignedTagIds.has(t.id));
      setTag1Id(assigned.find((t) => (t.tag_level ?? 1) === 1)?.id ?? null);
      setTag2Ids(new Set(assigned.filter((t) => t.tag_level === 2).map((t) => t.id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load taxonomy");
    } finally {
      setLoading(false);
    }
  }, [contentId, clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const tag1Options = useMemo(
    () => tags.filter((t) => (t.tag_level ?? 1) === 1 && (!categoryId || t.category_id === categoryId)),
    [tags, categoryId],
  );
  const tag2Options = useMemo(
    () => tags.filter((t) => t.tag_level === 2 && t.parent_tag_id === tag1Id),
    [tags, tag1Id],
  );

  const replaceCategory = async (catId: string | null) => {
    setBusy(true);
    try {
      await supabase.from("content_categories").delete().eq("content_id", contentId);
      if (catId) {
        const { error } = await supabase
          .from("content_categories")
          .insert({ content_id: contentId, category_id: catId });
        if (error) throw error;
      }
      // Changing category invalidates the tag chain.
      await supabase.from("content_tags").delete().eq("content_id", contentId);
      setCategoryId(catId);
      setTag1Id(null);
      setTag2Ids(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set category");
    } finally {
      setBusy(false);
    }
  };

  const replaceTag1 = async (id: string | null) => {
    setBusy(true);
    try {
      // Remove every currently assigned tag, then set the new Tag 1.
      await supabase.from("content_tags").delete().eq("content_id", contentId);
      if (id) {
        const { error } = await supabase
          .from("content_tags")
          .insert({ content_id: contentId, tag_id: id });
        if (error) throw error;
      }
      setTag1Id(id);
      setTag2Ids(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set tag");
    } finally {
      setBusy(false);
    }
  };

  const toggleTag2 = async (id: string) => {
    setBusy(true);
    const on = tag2Ids.has(id);
    try {
      if (on) {
        await supabase.from("content_tags").delete().eq("content_id", contentId).eq("tag_id", id);
      } else {
        const { error } = await supabase
          .from("content_tags")
          .insert({ content_id: contentId, tag_id: id });
        if (error) throw error;
      }
      setTag2Ids((prev) => {
        const next = new Set(prev);
        if (on) next.delete(id);
        else next.add(id);
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update tag");
    } finally {
      setBusy(false);
    }
  };

  const createCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("categories")
        .insert({
          client_id: clientId,
          category_type: "portfolio",
          name,
          slug: slugify(name) || null,
          sort_order: cats.length,
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      setCats((prev) => [...prev, data as Category]);
      setNewCat("");
      await replaceCategory((data as Category).id);
      toast.success(`Category "${name}" created & assigned`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setBusy(false);
    }
  };

  const createTag = async (level: 1 | 2) => {
    const name = (level === 1 ? newTag1 : newTag2).trim();
    if (!name) return;
    if (level === 1 && !categoryId) {
      toast.error("Pick a category first");
      return;
    }
    if (level === 2 && !tag1Id) {
      toast.error("Pick a Tag 1 first");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("tags")
        .insert({
          client_id: clientId,
          name,
          slug: slugify(name) || null,
          tag_level: level,
          category_id: level === 1 ? categoryId : (tags.find((t) => t.id === tag1Id)?.category_id ?? categoryId),
          parent_tag_id: level === 2 ? tag1Id : null,
          sort_order: 0,
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      const tag = data as Tag;
      setTags((prev) => [...prev, tag]);
      if (level === 1) {
        setNewTag1("");
        await replaceTag1(tag.id);
      } else {
        setNewTag2("");
        await toggleTag2(tag.id);
      }
      toast.success(`Tag ${level} "${name}" created & assigned`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setBusy(false);
    }
  };

  const Chip = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:border-primary"
      }`}
    >
      {on && <Check className="h-3 w-3" />}
      {label}
    </button>
  );

  const AddRow = ({
    value,
    onChange,
    onAdd,
    placeholder,
    disabled,
  }: {
    value: string;
    onChange: (v: string) => void;
    onAdd: () => void;
    placeholder: string;
    disabled?: boolean;
  }) => (
    <div className="flex gap-2 pt-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd();
          }
        }}
        placeholder={placeholder}
        className="h-8 text-sm"
        disabled={disabled}
      />
      <Button type="button" size="sm" variant="outline" onClick={onAdd} disabled={busy || disabled || !value.trim()}>
        <Plus className="mr-1 h-3 w-3" /> Add
      </Button>
    </div>
  );

  const label = (t: { name: string; name_zh?: string | null }) =>
    t.name_zh ? `${t.name} / ${t.name_zh}` : t.name;

  return (
    <div className="space-y-5 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Taxonomy — Category → Tag 1 → Tag 2</Label>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Level 0 — Category */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Category (choose one)
            </p>
            <div className="flex flex-wrap gap-2">
              {cats.length === 0 && (
                <span className="text-xs text-muted-foreground">No categories yet — add one below.</span>
              )}
              {cats.map((c) => (
                <Chip
                  key={c.id}
                  on={categoryId === c.id}
                  label={label(c)}
                  onClick={() => replaceCategory(categoryId === c.id ? null : c.id)}
                />
              ))}
            </div>
            <AddRow
              value={newCat}
              onChange={setNewCat}
              onAdd={createCategory}
              placeholder="New category (e.g. Residential)"
            />
          </div>

          {/* Level 1 — Tag 1 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tag 1 (choose one)
            </p>
            {!categoryId ? (
              <p className="text-xs text-muted-foreground">Select a category first.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {tag1Options.length === 0 && (
                    <span className="text-xs text-muted-foreground">No Tag 1 for this category yet.</span>
                  )}
                  {tag1Options.map((t) => (
                    <Chip
                      key={t.id}
                      on={tag1Id === t.id}
                      label={label(t)}
                      onClick={() => replaceTag1(tag1Id === t.id ? null : t.id)}
                    />
                  ))}
                </div>
                <AddRow
                  value={newTag1}
                  onChange={setNewTag1}
                  onAdd={() => createTag(1)}
                  placeholder="New Tag 1 (e.g. Single Family)"
                />
              </>
            )}
          </div>

          {/* Level 2 — Tag 2 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tag 2 (multiple allowed)
            </p>
            {!tag1Id ? (
              <p className="text-xs text-muted-foreground">Select a Tag 1 first.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {tag2Options.length === 0 && (
                    <span className="text-xs text-muted-foreground">No Tag 2 under this Tag 1 yet.</span>
                  )}
                  {tag2Options.map((t) => (
                    <Chip
                      key={t.id}
                      on={tag2Ids.has(t.id)}
                      label={label(t)}
                      onClick={() => toggleTag2(t.id)}
                    />
                  ))}
                </div>
                <AddRow
                  value={newTag2}
                  onChange={setNewTag2}
                  onAdd={() => createTag(2)}
                  placeholder="New Tag 2 (e.g. Laneway House)"
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

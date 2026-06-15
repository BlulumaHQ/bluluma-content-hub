import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Check } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Option {
  id: string;
  name: string;
}

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
 * Generic category + tag assignment for any portfolio item (any client).
 * - Categories: client-scoped, category_type = 'portfolio'.
 * - Tags: client-scoped.
 * Toggling a chip assigns/unassigns immediately (content_categories /
 * content_tags). You can also create new categories/tags inline.
 */
export function CategoryTagPanel({ contentId, clientId }: CategoryTagPanelProps) {
  const [cats, setCats] = useState<Option[]>([]);
  const [tags, setTags] = useState<Option[]>([]);
  const [assignedCats, setAssignedCats] = useState<Set<string>>(new Set());
  const [assignedTags, setAssignedTags] = useState<Set<string>>(new Set());
  const [newCat, setNewCat] = useState("");
  const [newTag, setNewTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: catRows }, { data: tagRows }, { data: cc }, { data: ct }] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name")
          .eq("client_id", clientId)
          .eq("category_type", "portfolio")
          .order("sort_order", { ascending: true }),
        supabase.from("tags").select("id, name").eq("client_id", clientId).order("name"),
        supabase.from("content_categories").select("category_id").eq("content_id", contentId),
        supabase.from("content_tags").select("tag_id").eq("content_id", contentId),
      ]);
      setCats((catRows as Option[]) ?? []);
      setTags((tagRows as Option[]) ?? []);
      setAssignedCats(new Set((cc ?? []).map((r: any) => r.category_id)));
      setAssignedTags(new Set((ct ?? []).map((r: any) => r.tag_id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [contentId, clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleCategory = async (cat: Option) => {
    setBusy(true);
    const isOn = assignedCats.has(cat.id);
    try {
      if (isOn) {
        await supabase
          .from("content_categories")
          .delete()
          .eq("content_id", contentId)
          .eq("category_id", cat.id);
      } else {
        await supabase
          .from("content_categories")
          .insert({ content_id: contentId, category_id: cat.id });
      }
      setAssignedCats((prev) => {
        const next = new Set(prev);
        isOn ? next.delete(cat.id) : next.add(cat.id);
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleTag = async (tag: Option) => {
    setBusy(true);
    const isOn = assignedTags.has(tag.id);
    try {
      if (isOn) {
        await supabase
          .from("content_tags")
          .delete()
          .eq("content_id", contentId)
          .eq("tag_id", tag.id);
      } else {
        await supabase.from("content_tags").insert({ content_id: contentId, tag_id: tag.id });
      }
      setAssignedTags((prev) => {
        const next = new Set(prev);
        isOn ? next.delete(tag.id) : next.add(tag.id);
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
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
          sort_order: 0,
        })
        .select("id, name")
        .single();
      if (error) throw error;
      const cat = data as Option;
      setCats((prev) => [...prev, cat]);
      setNewCat("");
      await supabase.from("content_categories").insert({ content_id: contentId, category_id: cat.id });
      setAssignedCats((prev) => new Set(prev).add(cat.id));
      toast.success(`Category "${cat.name}" created & assigned`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setBusy(false);
    }
  };

  const createTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("tags")
        .insert({ client_id: clientId, name, slug: slugify(name) || null })
        .select("id, name")
        .single();
      if (error) throw error;
      const tag = data as Option;
      setTags((prev) => [...prev, tag]);
      setNewTag("");
      await supabase.from("content_tags").insert({ content_id: contentId, tag_id: tag.id });
      setAssignedTags((prev) => new Set(prev).add(tag.id));
      toast.success(`Tag "${tag.name}" created & assigned`);
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

  return (
    <div className="space-y-5 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Categories &amp; Tags</Label>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Categories */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Categories
            </p>
            <div className="flex flex-wrap gap-2">
              {cats.length === 0 && (
                <span className="text-xs text-muted-foreground">No categories yet — add one below.</span>
              )}
              {cats.map((c) => (
                <Chip key={c.id} on={assignedCats.has(c.id)} label={c.name} onClick={() => toggleCategory(c)} />
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createCategory();
                  }
                }}
                placeholder="New category (e.g. Food & Beverage)"
                className="h-8 text-sm"
              />
              <Button type="button" size="sm" variant="outline" onClick={createCategory} disabled={busy || !newCat.trim()}>
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags</p>
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 && (
                <span className="text-xs text-muted-foreground">No tags yet — add one below.</span>
              )}
              {tags.map((t) => (
                <Chip key={t.id} on={assignedTags.has(t.id)} label={t.name} onClick={() => toggleTag(t)} />
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createTag();
                  }
                }}
                placeholder="New tag (e.g. Renovation)"
                className="h-8 text-sm"
              />
              <Button type="button" size="sm" variant="outline" onClick={createTag} disabled={busy || !newTag.trim()}>
                <Plus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

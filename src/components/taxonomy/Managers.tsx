import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useClientContext } from "@/contexts/ClientContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category, Tag } from "@/types";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

export function CategoriesManager({
  categoryType,
  title,
}: {
  categoryType: "portfolio" | "blog";
  title: string;
}) {
  const { selectedClient } = useClientContext();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [slug, setSlug] = useState("");
  const [sort, setSort] = useState("0");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["categories", categoryType, selectedClient?.id],
    queryFn: async (): Promise<Category[]> => {
      if (!selectedClient) return [];
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("category_type", categoryType)
        .eq("client_id", selectedClient.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as Category[]) ?? [];
    },
    enabled: !!selectedClient,
  });

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to manage categories.</p>
      </div>
    );
  }

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["categories", categoryType, selectedClient.id] });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("categories").insert({
        client_id: selectedClient.id,
        category_type: categoryType,
        name: name.trim(),
        name_zh: nameZh.trim() || null,
        slug: (slug.trim() || slugify(name)) || null,
        sort_order: Number(sort) || 0,
        is_active: true,
      });
      if (error) throw error;
      setName(""); setNameZh(""); setSlug(""); setSort("0");
      toast.success("Category added");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this category? Tags under it will lose their parent category.")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); refresh(); }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">For {selectedClient.client_name}</p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={handleAdd} className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Add New</h2>
          <div>
            <Label>Name (EN) *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label>名稱 (ZH)</Label>
            <Input value={nameZh} onChange={(e) => setNameZh(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto" className="mt-1" />
          </div>
          <div>
            <Label>Sort Order</Label>
            <Input type="number" value={sort} onChange={(e) => setSort(e.target.value)} className="mt-1" />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> {saving ? "Adding..." : "Add Category"}
          </Button>
        </form>

        <div className="lg:col-span-2 overflow-hidden rounded-lg border bg-card">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">中文</th>
                  <th className="px-4 py-2 font-medium">Slug</th>
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.name_zh ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.slug ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.sort_order ?? 0}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Hierarchical tag manager: Tag 1 belongs to a Category, Tag 2 belongs to a Tag 1.
 */
export function TagsManager({ title }: { title: string }) {
  const { selectedClient } = useClientContext();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [level, setLevel] = useState<"1" | "2">("1");
  const [categoryId, setCategoryId] = useState<string>("");
  const [parentTagId, setParentTagId] = useState<string>("");
  const [sort, setSort] = useState("0");
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories", "portfolio", selectedClient?.id],
    queryFn: async (): Promise<Category[]> => {
      if (!selectedClient) return [];
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("client_id", selectedClient.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as Category[]) ?? [];
    },
    enabled: !!selectedClient,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tags", selectedClient?.id],
    queryFn: async (): Promise<Tag[]> => {
      if (!selectedClient) return [];
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("client_id", selectedClient.id)
        .order("tag_level", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as Tag[]) ?? [];
    },
    enabled: !!selectedClient,
  });

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to manage tags.</p>
      </div>
    );
  }

  const tags = data ?? [];
  const cats = categories ?? [];
  const level1 = tags.filter((t) => (t.tag_level ?? 1) === 1);
  const catName = (id?: string | null) => cats.find((c) => c.id === id)?.name ?? "—";
  const tagName = (id?: string | null) => tags.find((t) => t.id === id)?.name ?? "—";

  const refresh = () => qc.invalidateQueries({ queryKey: ["tags", selectedClient.id] });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (level === "1" && !categoryId) {
      toast.error("Tag 1 needs a parent category");
      return;
    }
    if (level === "2" && !parentTagId) {
      toast.error("Tag 2 needs a parent Tag 1");
      return;
    }
    setSaving(true);
    try {
      const parent = tags.find((t) => t.id === parentTagId);
      const { error } = await supabase.from("tags").insert({
        client_id: selectedClient.id,
        name: name.trim(),
        name_zh: nameZh.trim() || null,
        slug: slugify(name) || null,
        tag_level: Number(level),
        category_id: level === "1" ? categoryId : (parent?.category_id ?? null),
        parent_tag_id: level === "2" ? parentTagId : null,
        sort_order: Number(sort) || 0,
        is_active: true,
      });
      if (error) throw error;
      setName(""); setNameZh(""); setSort("0");
      toast.success(`Tag ${level} added`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tag? Child tags will be orphaned.")) return;
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); refresh(); }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        For {selectedClient.client_name} — hierarchy: Category → Tag 1 → Tag 2
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={handleAdd} className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Add New Tag</h2>
          <div>
            <Label>Level</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as "1" | "2")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Tag 1 (under a Category)</SelectItem>
                <SelectItem value="2">Tag 2 (under a Tag 1)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {level === "1" ? (
            <div>
              <Label>Parent Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>Parent Tag 1 *</Label>
              <Select value={parentTagId} onValueChange={setParentTagId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select Tag 1" /></SelectTrigger>
                <SelectContent>
                  {level1.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {catName(t.category_id)} › {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Name (EN) *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label>名稱 (ZH)</Label>
            <Input value={nameZh} onChange={(e) => setNameZh(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Sort Order</Label>
            <Input type="number" value={sort} onChange={(e) => setSort(e.target.value)} className="mt-1" />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            <Plus className="mr-2 h-4 w-4" />{saving ? "Adding..." : "Add Tag"}
          </Button>
        </form>

        <div className="lg:col-span-2 overflow-hidden rounded-lg border bg-card">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : tags.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No tags yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Level</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">中文</th>
                  <th className="px-4 py-2 font-medium">Parent</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">Tag {t.tag_level ?? 1}</td>
                    <td className="px-4 py-2 font-medium">{t.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{t.name_zh ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {t.tag_level === 2 ? tagName(t.parent_tag_id) : catName(t.category_id)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

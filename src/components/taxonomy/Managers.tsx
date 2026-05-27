import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useClientContext } from "@/contexts/ClientContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/types";

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
        slug: (slug.trim() || slugify(name)) || null,
        sort_order: Number(sort) || 0,
      });
      if (error) throw error;
      setName(""); setSlug(""); setSort("0");
      toast.success("Category added");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this category?")) return;
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
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
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
                  <th className="px-4 py-2 font-medium">Slug</th>
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
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

export function TagsManager({ title }: { title: string }) {
  const { selectedClient } = useClientContext();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tags", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient) return [];
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("client_id", selectedClient.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
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

  const refresh = () => qc.invalidateQueries({ queryKey: ["tags", selectedClient.id] });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("tags").insert({
        client_id: selectedClient.id,
        name: name.trim(),
        slug: slugify(name),
      });
      if (error) throw error;
      setName("");
      toast.success("Tag added");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tag?")) return;
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); refresh(); }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">For {selectedClient.client_name}</p>

      <form onSubmit={handleAdd} className="mt-6 flex max-w-xl gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" />
        <Button type="submit" disabled={saving}><Plus className="mr-2 h-4 w-4" />Add</Button>
      </form>

      <div className="mt-6 rounded-lg border bg-card">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2 p-4">
            {data.map((t: { id: string; name: string; slug: string | null }) => (
              <div key={t.id} className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm">
                <span>{t.name}</span>
                <button onClick={() => handleDelete(t.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

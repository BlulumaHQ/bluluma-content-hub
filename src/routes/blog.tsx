import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { Plus, Search, Pencil, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchBlogPosts,
  deleteBlogPost,
  ensureDefaultBlogCategories,
} from "@/lib/blog";
import type { Category } from "@/types";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — Bluluma CMS Admin" },
      { name: "description", content: "Manage blog posts" },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  const { selectedClient } = useClientContext();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Seed default categories on first load for this client
  useEffect(() => {
    if (selectedClient) {
      ensureDefaultBlogCategories(selectedClient.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["blog-categories", selectedClient.id] });
      });
    }
  }, [selectedClient, queryClient]);

  const { data: posts, isLoading, error } = useQuery({
    queryKey: ["blog", selectedClient?.id],
    queryFn: () => fetchBlogPosts(selectedClient!.id),
    enabled: !!selectedClient,
  });

  const { data: categories } = useQuery({
    queryKey: ["blog-categories", selectedClient?.id],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("categories")
        .select("*")
        .eq("category_type", "blog")
        .or(`client_id.eq.${selectedClient!.id},client_id.is.null`)
        .order("sort_order");
      if (e) throw e;
      return (data as Category[]) ?? [];
    },
    enabled: !!selectedClient,
  });

  const filtered = useMemo(() => {
    if (!posts) return [];
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (categoryFilter !== "all") {
        if (!p.categories?.some((c) => c.id === categoryFilter)) return false;
      }
      if (q) {
        const hay = [
          p.title,
          p.excerpt ?? "",
          p.body_content ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, search, statusFilter, categoryFilter]);

  const handleDelete = async (id: string, title: string) => {
    if (!selectedClient) return;
    if (!confirm(`Delete blog post "${title}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteBlogPost(id, selectedClient.id);
      toast.success("Blog post deleted");
      queryClient.invalidateQueries({ queryKey: ["blog", selectedClient.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to manage blog posts.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Blog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage blog posts for {selectedClient.client_name}
          </p>
        </div>
        <Link to="/blog/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add New Blog
          </Button>
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, excerpt, content…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="mt-8 flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-destructive/20 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load blog posts"}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <p className="text-muted-foreground">
            {posts && posts.length > 0 ? "No posts match your filters." : "No blog posts yet."}
          </p>
          {(!posts || posts.length === 0) && (
            <Link to="/blog/new" className="mt-4">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add First Blog Post
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-16 px-3 py-2"></th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Publish Date</th>
                <th className="px-3 py-2">Updated</th>
                <th className="w-32 px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    {p.featured_image_url ? (
                      <img
                        src={p.featured_image_url}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-muted" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">
                      {p.title}
                      {p.is_featured && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          Featured
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">/{p.slug}</div>
                    {p.excerpt && (
                      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {p.excerpt}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {p.categories?.map((c) => (
                        <span key={c.id} className="rounded bg-secondary px-2 py-0.5 text-xs">
                          {c.name}
                        </span>
                      )) || <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                        p.status === "published"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : p.status === "draft"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                          : "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.publish_date ? new Date(p.publish_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Link to="/blog/preview/$id" params={{ id: p.id }}>
                        <Button variant="ghost" size="icon" title="Preview">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link to="/blog/$id" params={{ id: p.id }}>
                        <Button variant="ghost" size="icon" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        disabled={deletingId === p.id}
                        onClick={() => handleDelete(p.id, p.title)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

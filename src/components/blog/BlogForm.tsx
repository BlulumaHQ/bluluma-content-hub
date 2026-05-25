import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Upload, X, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Client, BlogPost, Category, Tag } from "@/types";

export interface BlogFormData {
  title: string;
  slug: string;
  excerpt: string;
  body_content: string;
  featured_image_url: string;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  sort_order: number;
  seo_title: string;
  seo_description: string;
  publish_date: string; // yyyy-mm-dd or ""
  category_ids: string[];
  tag_ids: string[];
  new_tag_names: string[]; // free-form tags to create
}

interface BlogFormProps {
  client: Client;
  initialData?: BlogPost;
  onSave: (data: BlogFormData) => Promise<void>;
  submitLabel: string;
  cancelHref?: string;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function BlogForm({
  client,
  initialData,
  onSave,
  submitLabel,
  cancelHref = "/blog",
}: BlogFormProps) {
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!initialData);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialData?.featured_image_url ?? null
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newTagInput, setNewTagInput] = useState("");

  const [form, setForm] = useState<BlogFormData>({
    title: initialData?.title ?? "",
    slug: initialData?.slug ?? "",
    excerpt: initialData?.excerpt ?? "",
    body_content: initialData?.body_content ?? "",
    featured_image_url: initialData?.featured_image_url ?? "",
    status: initialData?.status ?? "draft",
    is_featured: initialData?.is_featured ?? false,
    sort_order: initialData?.sort_order ?? 0,
    seo_title: initialData?.seo_title ?? "",
    seo_description: initialData?.seo_description ?? "",
    publish_date: initialData?.publish_date
      ? initialData.publish_date.slice(0, 10)
      : "",
    category_ids: initialData?.categories?.map((c) => c.id) ?? [],
    tag_ids: initialData?.tags?.map((t) => t.id) ?? [],
    new_tag_names: [],
  });

  // Auto-slug
  useEffect(() => {
    if (!slugTouched) {
      setForm((p) => ({ ...p, slug: slugify(p.title) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title]);

  const { data: categories } = useQuery({
    queryKey: ["blog-categories", client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("category_type", "blog")
        .or(`client_id.eq.${client.id},client_id.is.null`)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as Category[]) ?? [];
    },
  });

  const { data: tags } = useQuery({
    queryKey: ["blog-tags", client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .or(`client_id.eq.${client.id},client_id.is.null`)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as Tag[]) ?? [];
    },
  });

  const updateField = <K extends keyof BlogFormData>(field: K, value: BlogFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const toggleArrayValue = (field: "category_ids" | "tag_ids", id: string) => {
    setForm((prev) => {
      const list = prev[field];
      return {
        ...prev,
        [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
      };
    });
  };

  const handleImageUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() ?? "png";
        const filename = `${Date.now()}.${ext}`;
        const path = `${client.id}/blog/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from("content-images")
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("content-images")
          .getPublicUrl(path);

        const publicUrl = publicUrlData.publicUrl;
        updateField("featured_image_url", publicUrl);
        setPreviewUrl(publicUrl);
        toast.success("Image uploaded successfully");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to upload image");
      } finally {
        setUploading(false);
      }
    },
    [client.id]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
  };

  const removeImage = () => {
    updateField("featured_image_url", "");
    setPreviewUrl(null);
  };

  const addNewTag = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    if (form.new_tag_names.includes(trimmed)) {
      setNewTagInput("");
      return;
    }
    updateField("new_tag_names", [...form.new_tag_names, trimmed]);
    setNewTagInput("");
  };

  const removeNewTag = (name: string) => {
    updateField("new_tag_names", form.new_tag_names.filter((n) => n !== name));
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) nextErrors.title = "Title is required";
    if (!form.slug.trim()) nextErrors.slug = "Slug is required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await onSave(form);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
          />
          {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">Slug *</Label>
          <Input
            id="slug"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              updateField("slug", e.target.value);
            }}
          />
          {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="excerpt">Excerpt</Label>
        <Textarea
          id="excerpt"
          value={form.excerpt}
          onChange={(e) => updateField("excerpt", e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="body_content">Body Content (HTML supported)</Label>
        <Textarea
          id="body_content"
          value={form.body_content}
          onChange={(e) => updateField("body_content", e.target.value)}
          rows={12}
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label>Featured Image</Label>
        <div className="flex items-center gap-4">
          {previewUrl ? (
            <div className="relative h-32 w-32 overflow-hidden rounded-lg border">
              <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={removeImage}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-input bg-muted hover:bg-accent">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="mt-1 text-xs text-muted-foreground">Upload</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChange}
                disabled={uploading}
              />
            </label>
          )}
          <div className="flex-1 space-y-1">
            <Input
              placeholder="Or paste image URL"
              value={form.featured_image_url}
              onChange={(e) => {
                updateField("featured_image_url", e.target.value);
                setPreviewUrl(e.target.value || null);
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Categories</Label>
          <div className="rounded-md border p-3 max-h-48 overflow-auto space-y-1">
            {!categories || categories.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No categories yet. Create some on the Blog list page.
              </p>
            ) : (
              categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.category_ids.includes(c.id)}
                    onChange={() => toggleArrayValue("category_ids", c.id)}
                  />
                  {c.name}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="rounded-md border p-3 max-h-48 overflow-auto space-y-1">
            {(!tags || tags.length === 0) && form.new_tag_names.length === 0 ? (
              <p className="text-xs text-muted-foreground">No existing tags.</p>
            ) : (
              tags?.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.tag_ids.includes(t.id)}
                    onChange={() => toggleArrayValue("tag_ids", t.id)}
                  />
                  {t.name}
                </label>
              ))
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {form.new_tag_names.map((n) => (
              <span
                key={n}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
              >
                {n} (new)
                <button type="button" onClick={() => removeNewTag(n)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNewTag();
                }
              }}
              placeholder="New tag name"
            />
            <Button type="button" variant="outline" onClick={addNewTag}>
              Add
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={form.status}
            onValueChange={(v) =>
              updateField("status", v as "draft" | "published" | "archived")
            }
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="publish_date">Publish Date</Label>
          <Input
            id="publish_date"
            type="date"
            value={form.publish_date}
            onChange={(e) => updateField("publish_date", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sort_order">Sort Order</Label>
          <Input
            id="sort_order"
            type="number"
            value={form.sort_order}
            onChange={(e) =>
              updateField("sort_order", parseInt(e.target.value || "0", 10))
            }
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="is_featured"
          checked={form.is_featured}
          onCheckedChange={(v) => updateField("is_featured", v)}
        />
        <Label htmlFor="is_featured" className="cursor-pointer">
          Featured
        </Label>
      </div>

      <div className="border-t pt-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">SEO</h3>
        <div className="space-y-2">
          <Label htmlFor="seo_title">SEO Title</Label>
          <Input
            id="seo_title"
            value={form.seo_title}
            onChange={(e) => updateField("seo_title", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seo_description">SEO Description</Label>
          <Textarea
            id="seo_description"
            value={form.seo_description}
            onChange={(e) => updateField("seo_description", e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4">
        <Button type="submit" disabled={isSubmitting || uploading}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
        <Link to={cancelHref}>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}

import { useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Upload, X, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { TagInput } from "@/components/ui/TagInput";
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
import type { Client, PortfolioItem } from "@/types";

interface FormData {
  title: string;
  slug: string;
  excerpt: string;
  body_content: string;
  featured_image_url: string;
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  sort_order: number;
  live_url: string;
  services: string[];
  project_year: number | "";
  short_summary: string;
}

interface PortfolioFormProps {
  client: Client;
  initialData?: PortfolioItem;
  onSave: (data: FormData) => Promise<void>;
  onCancel?: () => void;
}



export function PortfolioForm({ client, initialData, onSave, onCancel }: PortfolioFormProps) {
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialData?.featured_image_url ?? null
  );
  const [services, setServices] = useState<string[]>(
    initialData?.portfolio_details?.services ?? []
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<FormData>({
    title: initialData?.title ?? "",
    slug: initialData?.slug ?? "",
    excerpt: initialData?.excerpt ?? "",
    body_content: initialData?.body_content ?? "",
    featured_image_url: initialData?.featured_image_url ?? "",
    status: initialData?.status ?? "draft",
    is_featured: initialData?.is_featured ?? false,
    sort_order: initialData?.sort_order ?? 0,
    live_url: initialData?.portfolio_details?.live_url ?? "",
    services: initialData?.portfolio_details?.services ?? [],
    project_year: initialData?.portfolio_details?.project_year ?? "",
    short_summary: initialData?.portfolio_details?.short_summary ?? "",
  });

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleImageUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() ?? "png";
        const filename = `${Date.now()}.${ext}`;
        const path = `${client.id}/portfolio/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from("content-images")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });

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
    if (!client) {
      toast.error("No client selected");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSave({ ...form, services });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
          />
          {errors.title && (
            <p className="text-xs text-destructive">{errors.title}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">Slug *</Label>
          <Input
            id="slug"
            value={form.slug}
            onChange={(e) => updateField("slug", e.target.value)}
          />
          {errors.slug && (
            <p className="text-xs text-destructive">{errors.slug}</p>
          )}
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
        <Label htmlFor="body_content">Body Content</Label>
        <Textarea
          id="body_content"
          value={form.body_content}
          onChange={(e) => updateField("body_content", e.target.value)}
          rows={8}
        />
      </div>

      <div className="space-y-2">
        <Label>Featured Image</Label>
        <div className="flex items-center gap-4">
          {previewUrl ? (
            <div className="relative h-32 w-32 overflow-hidden rounded-lg border">
              <img
                src={previewUrl}
                alt="Preview"
                className="h-full w-full object-cover"
              />
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
        </div>
      </div>

      <div className="space-y-2">
        <Label>Services</Label>
        <TagInput
          tags={services}
          onChange={(tags) => {
            setServices(tags);
            updateField("services", tags);
          }}
          placeholder="Add service and press Enter"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="live_url">Live URL</Label>
          <Input
            id="live_url"
            value={form.live_url}
            onChange={(e) => updateField("live_url", e.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="project_year">Project Year</Label>
          <Input
            id="project_year"
            type="number"
            value={form.project_year}
            onChange={(e) => {
              const val = e.target.value;
              updateField("project_year", val === "" ? "" : parseInt(val, 10));
            }}
            placeholder={new Date().getFullYear().toString()}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="short_summary">Short Summary</Label>
        <Textarea
          id="short_summary"
          value={form.short_summary}
          onChange={(e) => updateField("short_summary", e.target.value)}
          rows={2}
        />
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

        <div className="flex items-center gap-3 pt-8">
          <Switch
            id="is_featured"
            checked={form.is_featured}
            onCheckedChange={(v) => updateField("is_featured", v)}
          />
          <Label htmlFor="is_featured" className="cursor-pointer">
            Featured
          </Label>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4">
        <Button type="submit" disabled={isSubmitting || uploading}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? "Update Portfolio" : "Save Portfolio"}
        </Button>
        <Link to="/portfolio">
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}

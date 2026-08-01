import { useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Upload, X, Loader2, ChevronDown } from "lucide-react";

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
import {
  emptyPortfolioForm,
  portfolioFormFrom,
  type PortfolioFormData,
} from "@/lib/portfolio";

interface PortfolioFormProps {
  client: Client;
  initialData?: PortfolioItem;
  onSave: (data: PortfolioFormData) => Promise<void>;
  onCancel?: () => void;
}

function Section({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold">{title}</span>
          {description && (
            <span className="ml-2 text-xs text-muted-foreground">{description}</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="space-y-4 border-t p-4">{children}</div>}
    </div>
  );
}

export function PortfolioForm({ client, initialData, onSave, onCancel }: PortfolioFormProps) {
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<PortfolioFormData>(
    initialData ? portfolioFormFrom(initialData) : emptyPortfolioForm(),
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialData?.featured_image_url ?? null,
  );

  const set = <K extends keyof PortfolioFormData>(field: K, value: PortfolioFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as string];
        return next;
      });
    }
  };

  /** Small helper to render a labelled text input bound to the form. */
  const Field = ({
    name,
    label,
    placeholder,
    type = "text",
  }: {
    name: keyof PortfolioFormData;
    label: string;
    placeholder?: string;
    type?: string;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={String(name)}>{label}</Label>
      <Input
        id={String(name)}
        type={type}
        value={String(form[name] ?? "")}
        placeholder={placeholder}
        onChange={(e) => set(name, e.target.value as PortfolioFormData[typeof name])}
      />
    </div>
  );

  const Area = ({
    name,
    label,
    rows = 3,
    placeholder,
  }: {
    name: keyof PortfolioFormData;
    label: string;
    rows?: number;
    placeholder?: string;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={String(name)}>{label}</Label>
      <Textarea
        id={String(name)}
        rows={rows}
        placeholder={placeholder}
        value={String(form[name] ?? "")}
        onChange={(e) => set(name, e.target.value as PortfolioFormData[typeof name])}
      />
    </div>
  );

  const handleImageUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() ?? "png";
        const filename = `${Date.now()}.${ext}`;
        const path = `${client.id}/portfolio/${filename}`;
        const { error: uploadError } = await supabase.storage
          .from("content-images")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("content-images").getPublicUrl(path);
        set("featured_image_url", data.publicUrl);
        setPreviewUrl(data.publicUrl);
        toast.success("Image uploaded successfully");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to upload image");
      } finally {
        setUploading(false);
      }
    },
    [client.id],
  );

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Title is required";
    if (!form.slug.trim()) next.slug = "Slug is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fill in the required fields");
      return;
    }
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
    <form onSubmit={onSubmit} className="max-w-3xl space-y-4">
      {/* 1. Basic info */}
      <Section title="1. Basic Information" defaultOpen>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title (EN) *</Label>
            <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>
          <Field name="title_zh" label="標題 (ZH)" />
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug *</Label>
            <Input id="slug" value={form.slug} onChange={(e) => set("slug", e.target.value)} />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
          </div>
          <Field name="project_status" label="Project Status" placeholder="Completed / Under construction" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Area name="excerpt" label="Excerpt (EN)" rows={3} />
          <Area name="excerpt_zh" label="摘要 (ZH)" rows={3} />
        </div>

        <div className="space-y-1.5">
          <Label>Featured Image</Label>
          <div className="flex items-center gap-4">
            {previewUrl ? (
              <div className="relative h-32 w-32 overflow-hidden rounded-lg border">
                <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    set("featured_image_url", "");
                    setPreviewUrl(null);
                  }}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted hover:bg-accent">
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
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f);
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v as PortfolioFormData["status"])}
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
          <div className="space-y-1.5">
            <Label htmlFor="sort_order">Sort Order</Label>
            <Input
              id="sort_order"
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order", parseInt(e.target.value || "0", 10))}
            />
          </div>
          <div className="flex items-center gap-3 pt-7">
            <Switch
              id="is_featured"
              checked={form.is_featured}
              onCheckedChange={(v) => set("is_featured", v)}
            />
            <Label htmlFor="is_featured" className="cursor-pointer">
              Featured
            </Label>
          </div>
        </div>
      </Section>

      {/* 2. Location */}
      <Section title="2. Location">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field name="city" label="City" placeholder="Vancouver" />
          <Field name="province" label="Province / State" placeholder="BC" />
          <Field name="country" label="Country" placeholder="Canada" />
        </div>
        <Field name="location" label="Display Location" placeholder="West Vancouver, BC" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field name="year_started" label="Year Started" placeholder="2019" />
          <Field name="year_completed" label="Year Completed" placeholder="2022" />
          <Field name="project_year" label="Project Year (display)" placeholder="2022" />
        </div>
      </Section>

      {/* 3. Size & scale */}
      <Section title="3. Size & Scale">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field name="floor_area_value" label="Floor Area" placeholder="12500" />
          <Field name="floor_area_unit" label="Floor Area Unit" placeholder="sq ft" />
          <Field name="site_area_value" label="Site Area" placeholder="20000" />
          <Field name="site_area_unit" label="Site Area Unit" placeholder="sq ft" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field name="units_count" label="Units" />
          <Field name="storeys_count" label="Storeys" />
          <Field name="parking_spaces" label="Parking Spaces" />
          <Field name="construction_budget" label="Construction Budget" placeholder="$12M" />
        </div>
      </Section>

      {/* 4. Description */}
      <Section title="4. Description & Scope">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Area name="scope_of_work" label="Scope of Work (EN)" rows={4} />
          <Area name="scope_of_work_zh" label="工程範圍 (ZH)" rows={4} />
          <Area name="key_features" label="Key Features (EN)" rows={4} />
          <Area name="key_features_zh" label="主要特色 (ZH)" rows={4} />
        </div>
        <Area name="short_summary" label="Short Summary" rows={2} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Area name="body_content" label="Body Content (EN)" rows={8} />
          <Area name="body_content_zh" label="內文 (ZH)" rows={8} />
        </div>
        <div className="space-y-1.5">
          <Label>Services</Label>
          <TagInput
            tags={form.services}
            onChange={(tags) => set("services", tags)}
            placeholder="Add service and press Enter"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field name="role" label="Role" placeholder="Construction Manager" />
          <Field name="live_url" label="Live URL" placeholder="https://..." />
        </div>
      </Section>

      {/* 5. Credits */}
      <Section title="5. Project Credits">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field name="design_architect" label="Design Architect" />
          <Field name="architect_of_record" label="Architect of Record" />
          <Field name="interior_designer" label="Interior Designer" />
          <Field name="landscape_architect" label="Landscape Architect" />
          <Field name="structural_engineer" label="Structural Engineer" />
          <Field name="mechanical_engineer" label="Mechanical Engineer" />
          <Field name="electrical_engineer" label="Electrical Engineer" />
          <Field name="civil_engineer" label="Civil Engineer" />
          <Field name="general_contractor" label="General Contractor" />
          <Field name="developer_owner_client" label="Developer / Owner / Client" />
          <Field name="photographer" label="Photographer" />
        </div>
        <Area name="other_consultants" label="Other Consultants" rows={2} />
        <Area name="other_credits" label="Other Credits" rows={2} />
      </Section>

      {/* 6. Recognition */}
      <Section title="6. Awards & Publications">
        <Area name="awards" label="Awards" rows={3} />
        <Area name="publications" label="Publications" rows={3} />
      </Section>

      {/* 7. SEO */}
      <Section title="7. SEO">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field name="seo_title" label="SEO Title (EN)" />
          <Field name="seo_title_zh" label="SEO 標題 (ZH)" />
          <Area name="seo_description" label="SEO Description (EN)" rows={3} />
          <Area name="seo_description_zh" label="SEO 描述 (ZH)" rows={3} />
        </div>
      </Section>

      {/* 8. Migration */}
      <Section title="8. Migration & Internal">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field name="image_prefix" label="Image Prefix" placeholder="ballatree-rd" />
          <Field name="expected_gallery_count" label="Expected Gallery Count" />
        </div>
        <Area name="original_website_content" label="Original Website Content" rows={5} />
        <Area name="internal_notes" label="Internal Notes" rows={3} />
      </Section>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting || uploading}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? "Update Portfolio" : "Save Portfolio"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Link to="/portfolio">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        )}
      </div>
    </form>
  );
}

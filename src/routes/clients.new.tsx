import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
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

export const Route = createFileRoute("/clients/new")({
  head: () => ({ meta: [{ title: "Add New Client — Bluluma CMS Admin" }] }),
  component: NewClientPage,
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function NewClientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setSelectedClient, refreshClients } = useClientContext();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [brandColor, setBrandColor] = useState("#6366f1");
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Client name is required");
      return;
    }
    setSaving(true);

    const basePayload: Record<string, unknown> = {
      client_name: name.trim(),
      website_url: websiteUrl.trim() || null,
      industry: industry.trim() || null,
      brand_primary_color: brandColor || null,
      status,
    };
    const slugValue = slug.trim() || slugify(name);

    const attemptInsert = async (payload: Record<string, unknown>) =>
      supabase.from("clients").insert(payload).select("*").single();

    try {
      // Try with slug first; gracefully retry without it if the column doesn't exist.
      let { data, error } = await attemptInsert({ ...basePayload, slug: slugValue });

      if (error && /slug/i.test(error.message) && error.code === "PGRST204") {
        console.warn("[clients] 'slug' column missing — retrying without it.", error);
        toast.message("Note: 'slug' column missing in database — saving without slug.");
        ({ data, error } = await attemptInsert(basePayload));
      }

      if (error) {
        console.error("Supabase insert error:", error);
        toast.error(
          `Create client failed: ${error.message}${error.hint ? ` — ${error.hint}` : ""}`,
        );
        return;
      }

      await refreshClients();
      setSelectedClient(data);
      queryClient.invalidateQueries({ queryKey: ["clients-list"] });
      toast.success(`Client "${data.client_name}" created`);
      navigate({ to: "/" });
    } catch (err) {
      console.error("Unexpected error creating client:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Add New Client</h1>
        <Link to="/clients">
          <Button variant="outline">Cancel</Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-lg border bg-card p-6">
        <div>
          <Label htmlFor="name">Client Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
            className="mt-1"
            placeholder="auto-generated from name"
          />
        </div>

        <div>
          <Label htmlFor="website">Website URL</Label>
          <Input
            id="website"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className="mt-1"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="color">Brand Primary Color</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id="color"
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-9 w-16 p-1"
            />
            <Input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="flex-1"
            />
          </div>
        </div>

        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Link to="/clients"><Button type="button" variant="outline">Cancel</Button></Link>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create Client"}
          </Button>
        </div>
      </form>
    </div>
  );
}

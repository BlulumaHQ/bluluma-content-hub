import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { Client } from "@/types";

export const Route = createFileRoute("/clients/$id")({
  head: () => ({ meta: [{ title: "Edit Client — Bluluma CMS Admin" }] }),
  component: EditClientPage,
});

function EditClientPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setSelectedClient, selectedClient, refreshClients } = useClientContext();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Client;
    },
  });

  const [form, setForm] = useState({
    client_name: "",
    company_name_zh: "",
    slug: "",
    website_url: "",
    logo_url: "",
    industry: "",
    brand_primary_color: "#6366f1",
    default_locale: "en",
    supported_locales: ["en"] as string[],
    status: "active",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setForm({
        client_name: client.client_name ?? "",
        company_name_zh: client.company_name_zh ?? "",
        slug: client.slug ?? "",
        website_url: client.website_url ?? "",
        logo_url: client.logo_url ?? "",
        industry: client.industry ?? "",
        brand_primary_color: client.brand_primary_color ?? "#6366f1",
        default_locale: client.default_locale ?? "en",
        supported_locales: client.supported_locales ?? ["en"],
        status: client.status ?? "active",
      });
    }
  }, [client]);

  const toggleLocale = (code: string) =>
    setForm((f) => ({
      ...f,
      supported_locales: f.supported_locales.includes(code)
        ? f.supported_locales.filter((l) => l !== code)
        : [...f.supported_locales, code],
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const supported = form.supported_locales.includes(form.default_locale)
        ? form.supported_locales
        : [form.default_locale, ...form.supported_locales];
      const payload = {
        client_name: form.client_name.trim(),
        company_name_zh: form.company_name_zh.trim() || null,
        slug: form.slug.trim() || null,
        website_url: form.website_url.trim() || null,
        logo_url: form.logo_url.trim() || null,
        industry: form.industry.trim() || null,
        brand_primary_color: form.brand_primary_color || null,
        default_locale: form.default_locale,
        supported_locales: supported,
        status: form.status,
      };
      const { data, error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      await refreshClients();
      if (selectedClient?.id === id) setSelectedClient(data);
      queryClient.invalidateQueries({ queryKey: ["clients-list"] });
      queryClient.invalidateQueries({ queryKey: ["client", id] });
      toast.success("Client updated");
      navigate({ to: "/clients" });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };


  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Client</h1>
        <Link to="/clients"><Button variant="outline">Back</Button></Link>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-lg border bg-card p-6">
        <div>
          <Label>Client Name *</Label>
          <Input value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} required className="mt-1" />
        </div>
        <div>
          <Label>公司名稱 (ZH)</Label>
          <Input value={form.company_name_zh} onChange={(e) => setForm((f) => ({ ...f, company_name_zh: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Slug</Label>
          <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Website URL</Label>
          <Input type="url" value={form.website_url} onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Logo URL</Label>
          <Input value={form.logo_url} onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))} className="mt-1" placeholder="https://.../logo.svg" />
        </div>
        <div>
          <Label>Industry</Label>
          <Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} className="mt-1" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Default Locale</Label>
            <Select value={form.default_locale} onValueChange={(v) => setForm((f) => ({ ...f, default_locale: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English (en)</SelectItem>
                <SelectItem value="zh">中文 (zh)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Supported Locales</Label>
            <div className="mt-2 flex gap-2">
              {["en", "zh"].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleLocale(code)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    form.supported_locales.includes(code)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <Label>Brand Primary Color</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input type="color" value={form.brand_primary_color} onChange={(e) => setForm((f) => ({ ...f, brand_primary_color: e.target.value }))} className="h-9 w-16 p-1" />
            <Input value={form.brand_primary_color} onChange={(e) => setForm((f) => ({ ...f, brand_primary_color: e.target.value }))} className="flex-1" />
          </div>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
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
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </form>
    </div>
  );
}

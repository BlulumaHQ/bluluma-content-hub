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
    slug: "",
    website_url: "",
    industry: "",
    brand_primary_color: "#6366f1",
    status: "active",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setForm({
        client_name: client.client_name ?? "",
        slug: (client as { slug?: string }).slug ?? "",
        website_url: client.website_url ?? "",
        industry: client.industry ?? "",
        brand_primary_color: client.brand_primary_color ?? "#6366f1",
        status: client.status ?? "active",
      });
    }
  }, [client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        client_name: form.client_name.trim(),
        slug: form.slug.trim() || null,
        website_url: form.website_url.trim() || null,
        industry: form.industry.trim() || null,
        brand_primary_color: form.brand_primary_color || null,
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
          <Label>Slug</Label>
          <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Website URL</Label>
          <Input type="url" value={form.website_url} onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))} className="mt-1" />
        </div>
        <div>
          <Label>Industry</Label>
          <Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} className="mt-1" />
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

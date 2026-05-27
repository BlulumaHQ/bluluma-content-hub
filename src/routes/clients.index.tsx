import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import type { Client } from "@/types";

export const Route = createFileRoute("/clients/")({
  head: () => ({ meta: [{ title: "Clients — Bluluma CMS Admin" }] }),
  component: ClientsListPage,
});

function ClientsListPage() {
  const { selectedClient, setSelectedClient } = useClientContext();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Client[]) ?? [];
    },
  });

  const handleManage = (c: Client) => {
    setSelectedClient(c);
    toast.success(`Now managing ${c.client_name}`);
    navigate({ to: "/" });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage all clients in this CMS
          </p>
        </div>
        <Link to="/clients/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Add New Client
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-8 flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed py-20 text-center">
          <p className="text-muted-foreground">No clients yet.</p>
          <Link to="/clients/new" className="mt-4 inline-block">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add First Client
            </Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Website</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => {
                const isSelected = selectedClient?.id === c.id;
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {c.client_name}
                        {isSelected && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.website_url ? (
                        <a href={c.website_url} target="_blank" rel="noreferrer" className="hover:text-primary">
                          {c.website_url}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.industry ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.status ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link to="/clients/$id" params={{ id: c.id }}>
                          <Button size="sm" variant="outline">
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant={isSelected ? "secondary" : "default"}
                          onClick={() => handleManage(c)}
                          disabled={isSelected}
                        >
                          {isSelected ? "Managing" : "Manage"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

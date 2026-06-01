import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload, Trash2, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { PortfolioCard } from "@/components/portfolio/PortfolioCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContentItem, PortfolioDetail } from "@/types";

export const Route = createFileRoute("/portfolio/")({
  head: () => ({
    meta: [
      { title: "Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Manage portfolio items" },
    ],
  }),
  component: PortfolioPage,
});

async function deletePortfolioIds(ids: string[]): Promise<{ deleted: number; failed: { id: string; error: string }[] }> {
  if (ids.length === 0) return { deleted: 0, failed: [] };
  const failed: { id: string; error: string }[] = [];

  // Delete content_categories first
  const { error: ccErr } = await supabase.from("content_categories").delete().in("content_id", ids);
  if (ccErr) console.warn("content_categories delete:", ccErr.message);

  // Delete portfolio_details
  const { error: pdErr } = await supabase.from("portfolio_details").delete().in("content_id", ids);
  if (pdErr) console.warn("portfolio_details delete:", pdErr.message);

  // Delete content_items
  const { error: ciErr, count } = await supabase
    .from("content_items")
    .delete({ count: "exact" })
    .in("id", ids);

  if (ciErr) {
    ids.forEach((id) => failed.push({ id, error: ciErr.message }));
    return { deleted: 0, failed };
  }
  return { deleted: count ?? ids.length, failed };
}

function PortfolioPage() {
  const { selectedClient } = useClientContext();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [deleteAllStep, setDeleteAllStep] = useState<0 | 1 | 2>(0);
  const [deleteAllText, setDeleteAllText] = useState("");
  const [working, setWorking] = useState(false);

  const { data: items, isLoading, error } = useQuery({
    queryKey: ["portfolio", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient) return [];

      const { data: contentData, error: contentError } = await supabase
        .from("content_items")
        .select("*")
        .eq("client_id", selectedClient.id)
        .eq("content_type", "portfolio")
        .order("sort_order", { ascending: true });

      if (contentError) throw contentError;
      const contentItems = (contentData as ContentItem[]) ?? [];
      if (contentItems.length === 0) return [];

      const contentIds = contentItems.map((i) => i.id);
      const { data: detailsData, error: detailsError } = await supabase
        .from("portfolio_details")
        .select("*")
        .in("content_id", contentIds);

      if (detailsError) throw detailsError;

      const detailsMap = new Map<string, PortfolioDetail>();
      ((detailsData as PortfolioDetail[]) ?? []).forEach((d) => {
        detailsMap.set(d.content_id, d);
      });

      return contentItems.map((item) => ({
        ...item,
        portfolio_details: detailsMap.get(item.id),
      }));
    },
    enabled: !!selectedClient,
  });

  const allIds = useMemo(() => (items ?? []).map((i) => i.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: string, next: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const toggleAll = (next: boolean) => {
    setSelected(next ? new Set(allIds) : new Set());
  };

  const refresh = () => {
    if (!selectedClient) return;
    queryClient.invalidateQueries({ queryKey: ["portfolio", selectedClient.id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats", selectedClient.id] });
  };

  const handleDelete = async (id: string) => {
    if (!selectedClient) {
      toast.error("No client selected");
      return;
    }
    try {
      const { deleted, failed } = await deletePortfolioIds([id]);
      if (failed.length > 0) throw new Error(failed[0].error);
      if (deleted > 0) toast.success("Portfolio item deleted");
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedClient || selected.size === 0) return;
    setWorking(true);
    try {
      const ids = Array.from(selected);
      const { deleted, failed } = await deletePortfolioIds(ids);
      if (failed.length > 0) {
        toast.error(`${deleted} deleted, ${failed.length} failed: ${failed[0].error}`);
      } else {
        toast.success(`${deleted} portfolio items deleted successfully.`);
      }
      setSelected(new Set());
      setBulkConfirmOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!selectedClient) return;
    setWorking(true);
    try {
      const { data, error: listErr } = await supabase
        .from("content_items")
        .select("id")
        .eq("client_id", selectedClient.id)
        .eq("content_type", "portfolio");
      if (listErr) throw listErr;
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) {
        toast.info("No portfolio items to delete");
        setDeleteAllStep(0);
        setDeleteAllText("");
        return;
      }
      const { deleted, failed } = await deletePortfolioIds(ids);
      if (failed.length > 0) {
        toast.error(`${deleted} deleted, ${failed.length} failed`);
      } else {
        toast.success(`${deleted} portfolio items deleted successfully.`);
      }
      setSelected(new Set());
      setDeleteAllStep(0);
      setDeleteAllText("");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete all failed");
    } finally {
      setWorking(false);
    }
  };

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to manage portfolio.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage portfolio items for {selectedClient.client_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/portfolio/import">
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Bulk Import / Export
            </Button>
          </Link>
          <Link to="/portfolio/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add New Portfolio
            </Button>
          </Link>
        </div>
      </div>

      {items && items.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => toggleAll(v === true)}
              aria-label="Select all"
            />
            <span>
              {selected.size > 0
                ? `${selected.size} of ${items.length} selected`
                : `Select all (${items.length})`}
            </span>
          </label>
          <div className="flex items-center gap-2">
            {someSelected && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkConfirmOpen(true)}
                disabled={working}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected ({selected.size})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteAllStep(1)}
              disabled={working}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Delete All Portfolio Items
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="mt-8 flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : error ? (
        <div className="mt-8 rounded-lg border border-destructive/20 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load portfolio items"}
          </p>
        </div>
      ) : items && items.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <PortfolioCard
              key={item.id}
              item={item}
              client={selectedClient}
              onDelete={handleDelete}
              onEdited={refresh}
              selected={selected.has(item.id)}
              onToggleSelect={toggleOne}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <p className="text-muted-foreground">No portfolio items yet.</p>
          <Link to="/portfolio/new" className="mt-4">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add First Portfolio
            </Button>
          </Link>
        </div>
      )}

      {/* Bulk delete confirmation */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected portfolio items?</DialogTitle>
            <DialogDescription>
              You are about to delete {selected.size} selected portfolio items. This action cannot be undone. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirmOpen(false)} disabled={working}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={working}>
              {working ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete all — step 1 */}
      <Dialog open={deleteAllStep === 1} onOpenChange={(o) => !o && setDeleteAllStep(0)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete ALL portfolio items?</DialogTitle>
            <DialogDescription>
              This will delete all portfolio items for the currently selected client
              <strong> ({selectedClient.client_name})</strong>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAllStep(0)}>Cancel</Button>
            <Button variant="destructive" onClick={() => setDeleteAllStep(2)}>
              I understand, continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete all — step 2 (type to confirm) */}
      <Dialog
        open={deleteAllStep === 2}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteAllStep(0);
            setDeleteAllText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Type to confirm</DialogTitle>
            <DialogDescription>
              Type <code className="font-mono font-semibold">DELETE PORTFOLIO</code> to permanently
              delete all portfolio items for {selectedClient.client_name}.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteAllText}
            onChange={(e) => setDeleteAllText(e.target.value)}
            placeholder="DELETE PORTFOLIO"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteAllStep(0);
                setDeleteAllText("");
              }}
              disabled={working}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={working || deleteAllText !== "DELETE PORTFOLIO"}
            >
              {working ? "Deleting..." : "Delete All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload, Trash2, AlertTriangle, Save, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import { SortablePortfolioCard } from "@/components/portfolio/SortablePortfolioCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filterPortfolioTab, PORTFOLIO_WEBSITES, applyShowOn, type ShowOnMode, togglePendingFeatured, setPendingFeaturedMany, splitFeaturedChanges, countFeatured } from "@/lib/portfolio-editor";
import { Star } from "lucide-react";
import { bulkSetStatus, bulkSetShowOn } from "@/lib/portfolio-screenshots";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Check, Inbox, Globe, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContentItem, PortfolioDetail, PortfolioItem } from "@/types";

export const Route = createFileRoute("/_cms/portfolio/")({
  head: () => ({
    meta: [
      { title: "Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Manage portfolio items" },
      { property: "og:title", content: "Portfolio — Bluluma CMS Admin" },
      { property: "og:description", content: "Manage portfolio items" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortfolioPage,
});

async function deletePortfolioIds(ids: string[]): Promise<{ deleted: number; failed: { id: string; error: string }[] }> {
  if (ids.length === 0) return { deleted: 0, failed: [] };
  const failed: { id: string; error: string }[] = [];

  const { error: ccErr } = await supabase.from("content_categories").delete().in("content_id", ids);
  if (ccErr) console.warn("content_categories delete:", ccErr.message);

  const { error: pdErr } = await supabase.from("portfolio_details").delete().in("content_id", ids);
  if (pdErr) console.warn("portfolio_details delete:", pdErr.message);

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

  // Local order state
  const [orderedItems, setOrderedItems] = useState<PortfolioItem[]>([]);
  const savedOrderRef = useRef<PortfolioItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"draft" | "published">("draft");
  const [pendingFeatured, setPendingFeatured] = useState<Map<string, boolean>>(new Map());
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [savingFeatured, setSavingFeatured] = useState(false);
  const hasUnsaved = dirty || pendingFeatured.size > 0;

  const { data: items, isLoading, error } = useQuery({
    queryKey: ["portfolio", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient) return [];

      const { data: contentData, error: contentError } = await supabase
        .from("content_items")
        .select("*")
        .eq("client_id", selectedClient.id)
        .eq("content_type", "portfolio")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });

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
      const { data: categoryData, error: categoryError } = await supabase.from("content_categories").select("content_id,categories(id,name)").in("content_id", contentIds);
      if (categoryError) throw categoryError;
      const categories = (categoryData ?? []) as unknown as { content_id: string; categories: { id: string; name: string } | null }[];

      return contentItems.map((item) => ({
        ...item,
        portfolio_details: detailsMap.get(item.id),
        categories: categories.filter((row) => row.content_id === item.id).flatMap((row) => row.categories ? [row.categories] : []),
      })) as PortfolioItem[];
    },
    enabled: !!selectedClient,
  });

  // Sync local order when items or client changes (only when not dirty)
  useEffect(() => {
    if (!items) return;
    if (dirty) return;
    setOrderedItems(items);
    savedOrderRef.current = items;
  }, [items, dirty]);

  // Reset dirty state when switching clients
  useEffect(() => {
    setDirty(false);
    setSelected(new Set());
    setPendingFeatured(new Map());
  }, [selectedClient?.id]);

  const { setSwitchGuard } = useClientContext();
  useEffect(() => {
    if (!hasUnsaved) { setSwitchGuard(null); return; }
    setSwitchGuard(() => window.confirm(pendingFeatured.size > 0 ? "You have unsaved featured changes. Switch client and discard them?" : "You have unsaved order changes. Switch client and discard them?"));
    return () => setSwitchGuard(null);
  }, [hasUnsaved, pendingFeatured.size, setSwitchGuard]);

  // Warn on unload with unsaved changes
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  // Block in-app navigation when dirty
  useBlocker({
    shouldBlockFn: () => {
      if (!hasUnsaved) return false;
      return !window.confirm(pendingFeatured.size > 0 ? "You have unsaved featured changes. Leave without saving?" : "You have unsaved order changes. Leave without saving?");
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrderedItems((prev) => {
      const visible = filterPortfolioTab(prev, tab);
      const oldIndex = visible.findIndex((i) => i.id === active.id);
      const newIndex = visible.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const reordered = arrayMove(visible, oldIndex, newIndex);
      let index = 0;
      return prev.map((item) => item.status === tab ? (reordered[index++] ?? item) : item);
    });
    setDirty(true);
  };

  const isFeatured = (i: PortfolioItem) => (pendingFeatured.has(i.id) ? pendingFeatured.get(i.id)! : i.is_featured);
  const visibleItems = useMemo(() => {
    const list = filterPortfolioTab(orderedItems, tab);
    return featuredOnly ? list.filter((i) => (pendingFeatured.has(i.id) ? pendingFeatured.get(i.id) : i.is_featured)) : list;
  }, [orderedItems, tab, featuredOnly, pendingFeatured]);
  const featuredCount = useMemo(() => countFeatured(items ?? [], pendingFeatured), [items, pendingFeatured]);
  const toggleFeatured = (id: string) => {
    const item = orderedItems.find((i) => i.id === id);
    if (item) setPendingFeatured((p) => togglePendingFeatured(p, id, item.is_featured));
  };
  const saveFeatured = async () => {
    if (!selectedClient || pendingFeatured.size === 0 || savingFeatured) return;
    setSavingFeatured(true);
    try {
      const { on, off } = splitFeaturedChanges(pendingFeatured);
      for (const [ids, value] of [[on, true], [off, false]] as const) {
        if (ids.length === 0) continue;
        const { error: e } = await supabase.from("content_items").update({ is_featured: value }).in("id", ids).eq("client_id", selectedClient.id).eq("content_type", "portfolio");
        if (e) throw e;
      }
      await queryClient.invalidateQueries({ queryKey: ["portfolio", selectedClient.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", selectedClient.id] });
      const n = pendingFeatured.size;
      setPendingFeatured(new Map());
      toast.success(`Saved ${n} featured change${n === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save featured changes");
    } finally { setSavingFeatured(false); }
  };
  const allIds = useMemo(() => visibleItems.map((i) => i.id), [visibleItems]);
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

  const [bulkBusy, setBulkBusy] = useState(false);
  const [sitePick, setSitePick] = useState<string[]>([]);
  const [siteMode, setSiteMode] = useState<ShowOnMode>("add");
  const [siteOpen, setSiteOpen] = useState(false);
  const runBulk = async (action: () => Promise<number>) => {
    if (!selectedClient || selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const n = await action();
      toast.success(`Updated ${n} items`);
      setSelected(new Set());
      setSiteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
      refresh();
    }
  };
  const selectedItems = () => visibleItems.filter((i) => selected.has(i.id));

  const refresh = () => {
    if (!selectedClient) return;
    queryClient.invalidateQueries({ queryKey: ["portfolio", selectedClient.id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats", selectedClient.id] });
  };

  const handleResetOrder = () => {
    setOrderedItems(savedOrderRef.current);
    setDirty(false);
  };

  const handleSaveOrder = async () => {
    if (!selectedClient || saving) return;
    setSaving(true);
    try {
      // Normalize to a clean, contiguous 1..N sequence, but only write rows
      // whose sort_order actually changes.
      const changed = orderedItems
        .map((item, idx) => ({ item, next: idx + 1 }))
        .filter(({ item, next }) => (item.sort_order ?? null) !== next);

      const results = await Promise.all(
        changed.map(({ item, next }) =>
          supabase
            .from("content_items")
            .update({ sort_order: next, updated_at: new Date().toISOString() })
            .eq("id", item.id)
            .eq("client_id", selectedClient.id)
            .eq("content_type", "portfolio"),
        ),
      );
      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        console.error("Save order failures:", failed.map((f) => f.error));
        toast.error(`Failed to save order (${failed.length} error${failed.length > 1 ? "s" : ""}).`);
        return;
      }
      const nextSaved = orderedItems.map((it, idx) => ({ ...it, sort_order: idx + 1 }));
      savedOrderRef.current = nextSaved;
      setOrderedItems(nextSaved);
      setDirty(false);
      toast.success(
        changed.length === 0
          ? "Order already up to date."
          : `Portfolio order saved (${changed.length} project${changed.length > 1 ? "s" : ""} updated).`,
      );
      refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to save order");
    } finally {
      setSaving(false);
    }
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
      setDirty(false);
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
      setDirty(false);
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
      setDirty(false);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage portfolio items for {selectedClient.client_name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Inbox = not public. Published = live on the websites checked (BluLuma / SonyKun / SwiftLift). One portfolio can appear on several websites.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <Tabs value={tab} onValueChange={(value) => {
        if (dirty && !window.confirm("Discard unsaved order changes?")) return;
        if (dirty) handleResetOrder();
        setSelected(new Set());
        setTab(value === "published" ? "published" : "draft");
      }} className="mt-6"><TabsList><TabsTrigger value="draft">Inbox ({filterPortfolioTab(items ?? [], "draft").length})</TabsTrigger><TabsTrigger value="published">Published ({filterPortfolioTab(items ?? [], "published").length})</TabsTrigger></TabsList></Tabs>

      {someSelected && (
        <div className="sticky top-0 z-30 mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3 shadow-md">
          <span className="mr-2 text-sm font-semibold">{selected.size} selected</span>
          <Button size="sm" disabled={bulkBusy} onClick={() => runBulk(() => bulkSetStatus(Array.from(selected), selectedClient.id, "published"))}><Check className="mr-1 h-4 w-4" />Publish</Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => runBulk(() => bulkSetStatus(Array.from(selected), selectedClient.id, "draft"))}><Inbox className="mr-1 h-4 w-4" />Move to Inbox</Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => { setPendingFeatured((p) => setPendingFeaturedMany(p, items ?? [], selected, true)); setSelected(new Set()); }}><Star className="mr-1 h-4 w-4 fill-[var(--featured)] text-[var(--featured)]" />Mark featured</Button>
          <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => { setPendingFeatured((p) => setPendingFeaturedMany(p, items ?? [], selected, false)); setSelected(new Set()); }}><Star className="mr-1 h-4 w-4" />Remove featured</Button>
          <Popover open={siteOpen} onOpenChange={setSiteOpen}>
            <PopoverTrigger asChild><Button size="sm" variant="outline" disabled={bulkBusy}><Globe className="mr-1 h-4 w-4" />Show on</Button></PopoverTrigger>
            <PopoverContent className="w-64 space-y-3">
              <div className="space-y-2">
                {PORTFOLIO_WEBSITES.map((w) => (
                  <label key={w.value} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={sitePick.includes(w.value)} onCheckedChange={(v) => setSitePick((p) => v === true ? [...new Set([...p, w.value])] : p.filter((x) => x !== w.value))} />
                    {w.label}
                  </label>
                ))}
              </div>
              <RadioGroup value={siteMode} onValueChange={(v) => setSiteMode(v as ShowOnMode)} className="gap-1 border-t pt-2">
                {([["add", "Add to existing"], ["remove", "Remove from existing"], ["set", "Set exactly"]] as const).map(([v, l]) => (
                  <div key={v} className="flex items-center gap-2"><RadioGroupItem value={v} id={`mode-${v}`} /><Label htmlFor={`mode-${v}`} className="text-sm font-normal">{l}</Label></div>
                ))}
              </RadioGroup>
              <Button size="sm" className="w-full" disabled={bulkBusy || (siteMode !== "set" && sitePick.length === 0)}
                onClick={() => runBulk(() => bulkSetShowOn(selectedItems(), selectedClient.id, (cur) => applyShowOn(cur, sitePick, siteMode)))}>Apply</Button>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Set())}><X className="mr-1 h-4 w-4" />Clear selection</Button>
        </div>
      )}

      {orderedItems.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => toggleAll(v === true)}
              aria-label="Select all"
            />
            <span>
              {selected.size > 0
                ? `${selected.size} of ${visibleItems.length} selected`
                : `Select all (${visibleItems.length})`}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm font-medium"><Star className="h-4 w-4 fill-[var(--featured)] text-[var(--featured)]" />Featured: {featuredCount}</span>
            <Button size="sm" variant={featuredOnly ? "default" : "outline"} aria-pressed={featuredOnly} onClick={() => setFeaturedOnly((v) => !v)}>Featured only</Button>
            {dirty && (
              <span className="text-sm font-medium text-amber-600">
                Unsaved order changes
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetOrder}
              disabled={!dirty || saving}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Reset Order
            </Button>
            <Button
              size="sm"
              onClick={handleSaveOrder}
              disabled={!dirty || saving}
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving Order…" : "Save Order"}
            </Button>
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
      ) : visibleItems.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={allIds} strategy={rectSortingStrategy}>
            <div className="mt-6">
              {visibleItems.map((item) => (
                <SortablePortfolioCard
                  key={item.id}
                  item={item}
                  client={selectedClient}
                  onDelete={handleDelete}
                  onEdited={refresh}
                  selected={selected.has(item.id)}
                  onToggleSelect={toggleOne}
                  disabled={saving || featuredOnly}
                  featured={isFeatured(item)}
                  featuredPending={pendingFeatured.has(item.id)}
                  onToggleFeatured={toggleFeatured}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <p className="text-muted-foreground">{tab === "draft" ? "Inbox is empty." : "No published portfolio items."}</p>
          <Link to="/portfolio/new" className="mt-4">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add First Portfolio
            </Button>
          </Link>
        </div>
      )}

      {pendingFeatured.size > 0 && (
        <div className="sticky bottom-0 z-30 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3 shadow-md">
          <span className="text-sm font-semibold">{pendingFeatured.size} unsaved featured change{pendingFeatured.size === 1 ? "" : "s"}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={savingFeatured} onClick={() => setPendingFeatured(new Map())}>Discard</Button>
            <Button size="sm" disabled={savingFeatured} onClick={saveFeatured}>{savingFeatured ? "Saving…" : "Save changes"}</Button>
          </div>
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

      {/* Delete all — step 2 */}
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

import { createFileRoute } from "@tanstack/react-router";
import { Images } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useClientContext } from "@/contexts/ClientContext";
import { supabase } from "@/lib/supabase";
import type { MediaAsset } from "@/types";

export const Route = createFileRoute("/media")({
  head: () => ({
    meta: [
      { title: "Media Library — Bluluma CMS Admin" },
      { name: "description", content: "Media library" },
    ],
  }),
  component: MediaPage,
});

function MediaPage() {
  const { selectedClient } = useClientContext();

  const { data, isLoading } = useQuery({
    queryKey: ["media", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient) return [];
      const { data, error } = await supabase
        .from("media_assets")
        .select("*")
        .eq("client_id", selectedClient.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as MediaAsset[]) ?? [];
    },
    enabled: !!selectedClient,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Images className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">Media Library</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No media uploaded yet. Upload images from the Portfolio module.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Media Library</h1>
      <p className="mt-1 text-sm text-muted-foreground">Uploaded media for {selectedClient?.client_name}</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {data.map((asset) => (
          <div
            key={asset.id}
            className="group overflow-hidden rounded-lg border bg-card"
          >
            <div className="aspect-square overflow-hidden bg-muted">
              {asset.file_type?.startsWith("image/") ? (
                <img
                  src={asset.file_url}
                  alt={asset.file_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
                  {asset.file_type ?? "File"}
                </div>
              )}
            </div>
            <div className="p-2">
              <p className="truncate text-xs font-medium text-card-foreground">{asset.file_name}</p>
              {asset.file_size && (
                <p className="text-xs text-muted-foreground">
                  {(asset.file_size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useClientContext } from "@/contexts/ClientContext";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Bluluma CMS Admin" },
      { name: "description", content: "Client settings" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { selectedClient } = useClientContext();

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">No client selected.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Client information</p>

      <div className="mt-6 space-y-4 rounded-lg border bg-card p-6">
        <div>
          <label className="text-sm font-medium text-muted-foreground">Client Name</label>
          <p className="mt-1 text-base font-medium text-foreground">{selectedClient.client_name}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Website URL</label>
          <p className="mt-1 text-base text-foreground">
            {selectedClient.website_url ? (
              <a
                href={selectedClient.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {selectedClient.website_url}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Industry</label>
          <p className="mt-1 text-base text-foreground">
            {selectedClient.industry ?? <span className="text-muted-foreground">—</span>}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Brand Primary Color</label>
          <div className="mt-2 flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-md border"
              style={{
                backgroundColor: selectedClient.brand_primary_color ?? "#ccc",
              }}
            />
            <span className="text-sm text-foreground">
              {selectedClient.brand_primary_color ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

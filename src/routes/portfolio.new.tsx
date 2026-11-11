import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { PortfolioForm } from "@/components/portfolio/PortfolioForm";
import {
  createPortfolio,
  type DynamicSaveInput,
  type PortfolioFormData,
} from "@/lib/portfolio";

export const Route = createFileRoute("/portfolio/new")({
  head: () => ({
    meta: [
      { title: "New Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Add new portfolio item" },
      { property: "og:title", content: "New Portfolio — Bluluma CMS Admin" },
      { property: "og:description", content: "Add new portfolio item" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewPortfolioPage,
});

function NewPortfolioPage() {
  const { selectedClient } = useClientContext();
  const navigate = useNavigate();

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to add portfolio.</p>
      </div>
    );
  }

  const handleSave = async (data: PortfolioFormData, dynamic: DynamicSaveInput) => {
    const id = await createPortfolio(selectedClient.id, data, dynamic, { preserveClientName: true });
    toast.success("Portfolio created successfully");
    navigate({ to: "/portfolio/$id", params: { id } });
  };


  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Add New Portfolio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a new portfolio item for {selectedClient.client_name}
      </p>

      <div className="mt-6">
        <PortfolioForm client={selectedClient} onSave={handleSave} />
      </div>

      <div className="mt-6 max-w-3xl rounded-lg border border-dashed p-4">
        <h2 className="text-sm font-semibold text-foreground">Project Images</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Save the project first to add gallery images.
        </p>
      </div>
    </div>
  );
}

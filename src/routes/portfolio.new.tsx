import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { PortfolioForm } from "@/components/portfolio/PortfolioForm";
import { createPortfolio, type PortfolioFormData } from "@/lib/portfolio";

export const Route = createFileRoute("/portfolio/new")({
  head: () => ({
    meta: [
      { title: "New Portfolio — Bluluma CMS Admin" },
      { name: "description", content: "Add new portfolio item" },
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

  const handleSave = async (data: PortfolioFormData) => {
    const id = await createPortfolio(selectedClient.id, data);
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
    </div>
  );
}

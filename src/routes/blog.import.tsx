import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/blog/import")({
  head: () => ({ meta: [{ title: "Bulk Import Blog — Bluluma CMS" }] }),
  component: BulkImportPage,
});

function BulkImportPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Bulk Import Blog</h1>
      <p className="mt-1 text-sm text-muted-foreground">Import multiple blog posts at once.</p>

      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
        <Upload className="h-12 w-12 text-muted-foreground/50" />
        <h2 className="mt-4 text-lg font-semibold">Coming soon</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Bulk import via CSV or JSON will be available here. For now, add blog posts one by one
          from the New Blog page.
        </p>
        <Button disabled className="mt-6">Choose file</Button>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog — Bluluma CMS Admin" },
      { name: "description", content: "Blog management" },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <FileText className="h-16 w-16 text-muted-foreground/50" />
      <h2 className="mt-4 text-xl font-semibold text-foreground">Blog Module</h2>
      <p className="mt-2 text-sm text-muted-foreground">Blog management coming next.</p>
      <Button disabled className="mt-6">
        Add New Blog
      </Button>
    </div>
  );
}

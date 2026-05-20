import { createFileRoute } from "@tanstack/react-router";
import { Image } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Gallery — Bluluma CMS Admin" },
      { name: "description", content: "Gallery management" },
    ],
  }),
  component: GalleryPage,
});

function GalleryPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Image className="h-16 w-16 text-muted-foreground/50" />
      <h2 className="mt-4 text-xl font-semibold text-foreground">Gallery Module</h2>
      <p className="mt-2 text-sm text-muted-foreground">Gallery management coming next.</p>
      <Button disabled className="mt-6">
        Add New Gallery
      </Button>
    </div>
  );
}

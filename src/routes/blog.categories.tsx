import { createFileRoute } from "@tanstack/react-router";
import { CategoriesManager } from "@/components/taxonomy/Managers";

export const Route = createFileRoute("/blog/categories")({
  head: () => ({ meta: [
    { title: "Blog Categories — Bluluma CMS" },
    { name: "description", content: "Manage categories for blog posts in the Bluluma CMS." },
    { property: "og:title", content: "Blog Categories — Bluluma CMS" },
    { property: "og:description", content: "Manage categories for blog posts in the Bluluma CMS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <CategoriesManager categoryType="blog" title="Blog Categories" />,
});

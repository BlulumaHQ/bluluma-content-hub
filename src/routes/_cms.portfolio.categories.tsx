import { createFileRoute } from "@tanstack/react-router";
import { CategoriesManager } from "@/components/taxonomy/Managers";

export const Route = createFileRoute("/_cms/portfolio/categories")({
  head: () => ({ meta: [
    { title: "Portfolio Categories — Bluluma CMS" },
    { name: "description", content: "Manage categories for portfolio items in the Bluluma CMS." },
    { property: "og:title", content: "Portfolio Categories — Bluluma CMS" },
    { property: "og:description", content: "Manage categories for portfolio items in the Bluluma CMS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <CategoriesManager categoryType="portfolio" title="Portfolio Categories" />,
});

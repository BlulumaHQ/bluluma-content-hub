import { createFileRoute } from "@tanstack/react-router";
import { CategoriesManager } from "@/components/taxonomy/Managers";

export const Route = createFileRoute("/portfolio/categories")({
  head: () => ({ meta: [{ title: "Portfolio Categories — Bluluma CMS" }] }),
  component: () => <CategoriesManager categoryType="portfolio" title="Portfolio Categories" />,
});

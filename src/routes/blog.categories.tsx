import { createFileRoute } from "@tanstack/react-router";
import { CategoriesManager } from "@/components/taxonomy/Managers";

export const Route = createFileRoute("/blog/categories")({
  head: () => ({ meta: [{ title: "Blog Categories — Bluluma CMS" }] }),
  component: () => <CategoriesManager categoryType="blog" title="Blog Categories" />,
});

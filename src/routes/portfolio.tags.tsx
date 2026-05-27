import { createFileRoute } from "@tanstack/react-router";
import { TagsManager } from "@/components/taxonomy/Managers";

export const Route = createFileRoute("/portfolio/tags")({
  head: () => ({ meta: [{ title: "Portfolio Tags — Bluluma CMS" }] }),
  component: () => <TagsManager title="Portfolio Tags" />,
});

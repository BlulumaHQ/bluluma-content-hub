import { createFileRoute } from "@tanstack/react-router";
import { TagsManager } from "@/components/taxonomy/Managers";

export const Route = createFileRoute("/blog/tags")({
  head: () => ({ meta: [{ title: "Blog Tags — Bluluma CMS" }] }),
  component: () => <TagsManager title="Blog Tags" />,
});

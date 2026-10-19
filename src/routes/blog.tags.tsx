import { createFileRoute } from "@tanstack/react-router";
import { TagsManager } from "@/components/taxonomy/Managers";

export const Route = createFileRoute("/blog/tags")({
  head: () => ({ meta: [
    { title: "Blog Tags — Bluluma CMS" },
    { name: "description", content: "Manage tags for blog posts in the Bluluma CMS." },
    { property: "og:title", content: "Blog Tags — Bluluma CMS" },
    { property: "og:description", content: "Manage tags for blog posts in the Bluluma CMS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <TagsManager title="Blog Tags" />,
});

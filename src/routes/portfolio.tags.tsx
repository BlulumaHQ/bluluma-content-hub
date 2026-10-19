import { createFileRoute } from "@tanstack/react-router";
import { TagsManager } from "@/components/taxonomy/Managers";

export const Route = createFileRoute("/portfolio/tags")({
  head: () => ({ meta: [
    { title: "Portfolio Tags — Bluluma CMS" },
    { name: "description", content: "Manage tags for portfolio items in the Bluluma CMS." },
    { property: "og:title", content: "Portfolio Tags — Bluluma CMS" },
    { property: "og:description", content: "Manage tags for portfolio items in the Bluluma CMS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <TagsManager title="Portfolio Tags" />,
});

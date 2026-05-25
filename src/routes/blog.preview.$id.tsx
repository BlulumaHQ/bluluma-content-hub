import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ArrowLeft, Pencil } from "lucide-react";

import { useClientContext } from "@/contexts/ClientContext";
import { fetchBlogPost } from "@/lib/blog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/blog/preview/$id")({
  head: () => ({
    meta: [{ title: "Blog Preview — Bluluma CMS Admin" }],
  }),
  component: BlogPreviewPage,
});

function BlogPreviewPage() {
  const { id } = Route.useParams();
  const { selectedClient } = useClientContext();

  const { data: post, isLoading, error } = useQuery({
    queryKey: ["blog", selectedClient?.id, id],
    queryFn: () => fetchBlogPost(id, selectedClient!.id),
    enabled: !!selectedClient,
  });

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to preview.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Blog post not found"}
          </p>
        </div>
        <Link to="/blog">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Blog
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <Link to="/blog">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to list
          </Button>
        </Link>
        <Link to="/blog/$id" params={{ id: post.id }}>
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
        </Link>
      </div>

      <article className="mt-6 rounded-lg border bg-card p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`rounded-full px-2 py-0.5 ${
              post.status === "published"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
            }`}
          >
            {post.status}
          </span>
          {post.publish_date && <span>{new Date(post.publish_date).toLocaleDateString()}</span>}
          {post.categories?.map((c) => (
            <span key={c.id} className="rounded bg-secondary px-2 py-0.5">
              {c.name}
            </span>
          ))}
        </div>

        <h1 className="text-3xl font-bold text-foreground">{post.title}</h1>

        {post.excerpt && (
          <p className="mt-4 text-lg text-muted-foreground">{post.excerpt}</p>
        )}

        {post.featured_image_url && (
          <img
            src={post.featured_image_url}
            alt={post.title}
            className="mt-6 w-full rounded-lg border object-cover"
          />
        )}

        {post.body_content && (
          <div
            className="prose prose-sm mt-6 max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: post.body_content }}
          />
        )}

        {post.tags && post.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-1 border-t pt-4">
            <span className="text-xs text-muted-foreground mr-2">Tags:</span>
            {post.tags.map((t) => (
              <span key={t.id} className="rounded bg-secondary px-2 py-0.5 text-xs">
                #{t.name}
              </span>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

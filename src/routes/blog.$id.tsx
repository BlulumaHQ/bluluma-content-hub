import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { BlogForm } from "@/components/blog/BlogForm";
import { fetchBlogPost, updateBlogPost } from "@/lib/blog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/blog/$id")({
  head: () => ({
    meta: [{ title: "Edit Blog Post — Bluluma CMS Admin" }],
  }),
  component: EditBlogPage,
});

function EditBlogPage() {
  const { id } = Route.useParams();
  const { selectedClient } = useClientContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: post, isLoading, error } = useQuery({
    queryKey: ["blog", selectedClient?.id, id],
    queryFn: () => fetchBlogPost(id, selectedClient!.id),
    enabled: !!selectedClient,
  });

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to edit blog posts.</p>
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
          <Button variant="outline">Back to Blog</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Edit Blog Post</h1>
      <p className="mt-1 text-sm text-muted-foreground">{post.title}</p>
      <div className="mt-6">
        <BlogForm
          client={selectedClient}
          initialData={post}
          submitLabel="Update Blog Post"
          onSave={async (form) => {
            await updateBlogPost(id, selectedClient.id, form);
            toast.success("Blog post updated");
            queryClient.invalidateQueries({ queryKey: ["blog", selectedClient.id] });
            queryClient.invalidateQueries({ queryKey: ["blog", selectedClient.id, id] });
            navigate({ to: "/blog" });
          }}
        />
      </div>
    </div>
  );
}

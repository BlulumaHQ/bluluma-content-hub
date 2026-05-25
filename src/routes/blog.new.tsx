import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useClientContext } from "@/contexts/ClientContext";
import { BlogForm } from "@/components/blog/BlogForm";
import { createBlogPost } from "@/lib/blog";

export const Route = createFileRoute("/blog/new")({
  head: () => ({
    meta: [{ title: "New Blog Post — Bluluma CMS Admin" }],
  }),
  component: NewBlogPage,
});

function NewBlogPage() {
  const { selectedClient } = useClientContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (!selectedClient) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Select a client to create a blog post.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">New Blog Post</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a new blog post for {selectedClient.client_name}
      </p>
      <div className="mt-6">
        <BlogForm
          client={selectedClient}
          submitLabel="Save Blog Post"
          onSave={async (form) => {
            await createBlogPost(selectedClient.id, form);
            toast.success("Blog post created");
            queryClient.invalidateQueries({ queryKey: ["blog", selectedClient.id] });
            navigate({ to: "/blog" });
          }}
        />
      </div>
    </div>
  );
}

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_cms/blog")({
  component: () => <Outlet />,
});

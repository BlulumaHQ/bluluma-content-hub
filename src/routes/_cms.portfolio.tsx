import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_cms/portfolio")({
  component: () => <Outlet />,
});

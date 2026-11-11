import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { supabase } from "@/lib/supabase";
import { createCmsAuth } from "@/lib/cms-auth";

export const getRouter = () => {
  const queryClient = new QueryClient();
  const auth = createCmsAuth(supabase, async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
  });

  const router = createRouter({
    routeTree,
    context: { queryClient, auth },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

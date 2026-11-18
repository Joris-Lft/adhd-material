import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { SessionProvider } from "@/features/auth/SessionProvider";

export function renderApp(routes: RouteObject[], path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
  return { router, queryClient };
}

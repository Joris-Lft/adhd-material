import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { PwaUpdatePrompt } from "@/components/layout/PwaUpdatePrompt";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/query-client";
import { router } from "@/routes/router";
import "./index.css";

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })),
    )
  : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
      <Toaster />
      <PwaUpdatePrompt />
      {ReactQueryDevtools && (
        <Suspense>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  </StrictMode>,
);

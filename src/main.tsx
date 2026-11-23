import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { PwaUpdatePrompt } from "@/components/layout/PwaUpdatePrompt";
import { SessionProvider } from "@/features/auth/SessionProvider";
import { Toaster } from "@/components/ui/sonner";
import { startInstallPromptCapture } from "@/lib/install-prompt";
import { queryClient } from "@/lib/query-client";
import { router } from "@/routes/router";
import "./index.css";

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })),
    )
  : null;

// beforeinstallprompt peut partir avant le premier rendu : on l'écoute tout de suite.
startInstallPromptCapture();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PwaUpdatePrompt>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </PwaUpdatePrompt>
      <Toaster />
      {ReactQueryDevtools && (
        <Suspense>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  </StrictMode>,
);

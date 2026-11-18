import type { LazyRouteFunction, RouteObject } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLoader } from "@/components/layout/PageLoader";
import { RootErrorBoundary } from "@/components/layout/RootErrorBoundary";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { GuestOnly, RequireAuth, RequireOnboarded } from "./guards";

// Pages chargées à la demande : le chunk initial reste léger.
const page = (
  load: () => Promise<{ Component: React.ComponentType }>,
): {
  lazy: LazyRouteFunction<RouteObject>;
} => ({ lazy: async () => ({ Component: (await load()).Component }) });

const loginPage = page(() => import("@/pages/LoginPage").then((m) => ({ Component: m.LoginPage })));
const callbackPage = page(() =>
  import("@/pages/AuthCallbackPage").then((m) => ({ Component: m.AuthCallbackPage })),
);
const confirmationPage = page(() =>
  import("@/pages/AuthConfirmationPage").then((m) => ({ Component: m.AuthConfirmationPage })),
);
const welcomePage = page(() =>
  import("@/pages/WelcomePage").then((m) => ({ Component: m.WelcomePage })),
);
const profilePage = page(() =>
  import("@/pages/ProfilePage").then((m) => ({ Component: m.ProfilePage })),
);

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <RootErrorBoundary />,
    HydrateFallback: PageLoader,
    children: [
      { path: "/", element: <HomePage /> },
      { element: <GuestOnly />, children: [{ path: "/connexion", ...loginPage }] },
      { path: "/auth/callback", ...callbackPage },
      { path: "/auth/confirmation", ...confirmationPage },
      {
        element: <RequireAuth />,
        children: [
          { path: "/bienvenue", ...welcomePage },
          {
            element: <RequireOnboarded />,
            children: [{ path: "/profil", ...profilePage }],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

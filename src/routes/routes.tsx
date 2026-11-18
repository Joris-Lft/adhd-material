import type { RouteObject } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { RootErrorBoundary } from "@/components/layout/RootErrorBoundary";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <RootErrorBoundary />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/connexion", element: <LoginPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

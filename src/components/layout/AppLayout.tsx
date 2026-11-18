import { Link, Outlet, ScrollRestoration } from "react-router";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Package className="size-5 text-primary" aria-hidden="true" />
            adhd-material
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link to="/connexion">Connexion</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}

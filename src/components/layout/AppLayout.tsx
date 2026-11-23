import { useRef } from "react";
import { Link, Outlet, ScrollRestoration } from "react-router";
import { ListChecks, Package, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/useSession";
import { useFocusHeadingOnNavigation } from "@/hooks/useFocusHeadingOnNavigation";
import { useMyProfile } from "@/hooks/useMyProfile";

function AccountLink() {
  const { session, loading } = useSession();
  const { data: profile } = useMyProfile();

  if (loading) return <div className="h-11 w-28" aria-hidden="true" />;
  if (!session) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/connexion">Connexion</Link>
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm" className="max-w-48">
      <Link to="/profil">
        <User aria-hidden="true" />
        <span className="truncate">{profile?.display_name ?? "Mon profil"}</span>
      </Link>
    </Button>
  );
}

function MyListingsLink() {
  const { session } = useSession();
  if (!session) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to="/mes-annonces">
        <ListChecks aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Mes annonces</span>
      </Link>
    </Button>
  );
}

export function AppLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusHeadingOnNavigation(mainRef);

  function skipToContent(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    mainRef.current?.focus();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenu"
        onClick={skipToContent}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-2 px-4">
          <Link to="/" className="flex min-h-11 items-center gap-2 font-semibold">
            <Package className="size-5 text-primary" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">adhd-material</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link to="/publier">
                <Plus aria-hidden="true" />
                Publier
              </Link>
            </Button>
            <MyListingsLink />
            <AccountLink />
          </nav>
        </div>
      </header>
      <main
        id="contenu"
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 outline-none"
      >
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}

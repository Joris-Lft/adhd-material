import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function RootErrorBoundary() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Oups, quelque chose s'est mal passé</h1>
      <p className="text-muted-foreground">
        Ce n'est pas ta faute. Tu peux recharger la page ou revenir à l'accueil.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Recharger</Button>
        <Button asChild variant="outline">
          <Link to="/">Retour à l'accueil</Link>
        </Button>
      </div>
    </main>
  );
}

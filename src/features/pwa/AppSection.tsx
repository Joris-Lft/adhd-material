import { InstallApp } from "@/features/pwa/InstallApp";
import { UpdateCheck } from "@/features/pwa/UpdateCheck";

/** Profil : installation, mise à jour et version de l'appli. */
export function AppSection() {
  return (
    <section aria-labelledby="app-heading" className="space-y-4">
      <h2 id="app-heading" className="text-lg font-semibold">
        L'appli
      </h2>
      <InstallApp />
      <UpdateCheck />
      <p className="text-xs text-muted-foreground">Version {__APP_VERSION__}</p>
    </section>
  );
}

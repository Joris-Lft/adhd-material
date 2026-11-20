import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ListingForm } from "@/features/listings/ListingForm";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

function PublishedScreen({ onAnother }: { onAnother: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <div className="space-y-6">
      <h1 ref={titleRef} tabIndex={-1} className="text-2xl font-bold outline-none">
        Annonce publiée
      </h1>
      <p className="text-muted-foreground">Merci ! Ton annonce est en ligne.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={onAnother}>
          Publier une autre annonce
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Retour à l'accueil</Link>
        </Button>
      </div>
    </div>
  );
}

export function PublishPage() {
  useDocumentTitle("Publier une annonce");
  // L'id de l'annonce créée est conservé pour la fiche d'annonce (lot 5b).
  const [published, setPublished] = useState<{ id: string } | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (published) {
    return (
      <section className="mx-auto max-w-xl">
        <PublishedScreen
          onAnother={() => {
            setPublished(null);
            setFormKey((key) => key + 1);
          }}
        />
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Publier une annonce</h1>
      <ListingForm
        key={formKey}
        onPublished={(id) => {
          setPublished({ id });
          toast.success("Annonce publiée");
        }}
      />
    </section>
  );
}

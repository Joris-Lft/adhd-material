import { Link } from "react-router";
import { PageLoader } from "@/components/layout/PageLoader";
import { Button } from "@/components/ui/button";
import { ConversationItem } from "@/features/messages/ConversationItem";
import { useConversations } from "@/hooks/useConversations";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { GENERIC_ERROR } from "@/lib/messages";

export function ConversationsPage() {
  useDocumentTitle("Messages");
  const query = useConversations();
  const conversations = query.data;

  let content;
  if (query.isPending) content = <PageLoader />;
  else if (!conversations) {
    content = (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          {GENERIC_ERROR}
        </p>
        <Button type="button" variant="outline" onClick={() => query.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  } else if (conversations.length === 0) {
    content = (
      <div className="space-y-4 rounded-xl border border-dashed p-6">
        <p className="text-muted-foreground">
          Tu n'as pas encore de conversation. Quand tu contacteras l'auteur d'une annonce, ou qu'on
          te contactera, tout s'affichera ici.
        </p>
        <Button asChild>
          <Link to="/">Voir les annonces</Link>
        </Button>
      </div>
    );
  } else {
    content = (
      <ul className="space-y-3">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <ConversationItem conversation={conversation} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Messages</h1>
      {content}
    </section>
  );
}

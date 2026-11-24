import { cn } from "@/lib/utils";
import type { ListingKind, ListingStatus } from "@/services/listings";
import { KIND_LABEL, STATUS_LABEL } from "./listing-labels";

const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function KindBadge({ kind }: { kind: ListingKind }) {
  return <span className={cn(base, "bg-primary/10 text-primary")}>{KIND_LABEL[kind]}</span>;
}

/** Badge de statut ; rien pour une annonce disponible. */
export function StatusBadge({ status }: { status: ListingStatus }) {
  if (status === "disponible") return null;
  return (
    <span
      className={cn(base, "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200")}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

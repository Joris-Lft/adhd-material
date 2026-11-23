import { useMutation } from "@tanstack/react-query";
import { reportListing } from "@/services/reports";

/** Signale une annonce : rien à invalider, le signalement n'est visible de personne d'autre. */
export function useReportListing() {
  return useMutation({ mutationFn: reportListing });
}

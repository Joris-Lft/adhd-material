import { supabase } from "@/lib/supabase";
import { mapReportError } from "@/lib/messages";

export const REPORT_CATEGORIES = [
  { value: "arnaque", label: "Arnaque ou demande d'argent" },
  { value: "inapproprie", label: "Contenu choquant ou inapproprié" },
  { value: "dangereux", label: "Objet dangereux ou interdit" },
  { value: "donnees_personnelles", label: "Données personnelles exposées" },
  { value: "autre", label: "Autre raison" },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];

export const REPORT_DETAILS_MIN = 3;
export const REPORT_DETAILS_MAX = 1000;

/** Échec d'un signalement ; le message est prêt à afficher, `hint` est la clé du serveur. */
export class ReportError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.hint = hint;
  }
}

interface RpcError {
  code?: string;
  hint?: string;
  message?: string;
  status?: number;
}

/** Signale une annonce. `alreadyReported` : tu l'avais déjà signalée (pas une erreur). */
export async function reportListing(input: {
  listingId: string;
  category: ReportCategory;
  details?: string;
}): Promise<{ alreadyReported: boolean }> {
  let error: RpcError | null;
  try {
    ({ error } = await supabase.rpc("report_listing", {
      p_listing_id: input.listingId,
      p_category: input.category,
      ...(input.details ? { p_details: input.details } : {}),
    }));
  } catch (thrown) {
    error = { message: thrown instanceof Error ? thrown.message : "" };
  }
  if (!error) return { alreadyReported: false };
  if (error.hint === "already_reported") return { alreadyReported: true };
  throw new ReportError(mapReportError(error), error.hint);
}

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "@/features/auth/useSession";
import { LISTING_SESSION_EXPIRED } from "@/lib/messages";
import {
  createListing,
  ListingError,
  type CreateListingCallbacks,
  type CreateListingInput,
  type ListingStep,
} from "@/services/listings";

/** Publication d'une annonce ; `step` indique l'étape en cours (envoi des photos, puis publication). */
export function useCreateListing() {
  const userId = useSession().session?.user.id;
  const [step, setStep] = useState<ListingStep | null>(null);
  const mutation = useMutation({
    mutationFn: ({
      onActivityResolved,
      ...input
    }: Omit<CreateListingInput, "userId"> & Pick<CreateListingCallbacks, "onActivityResolved">) => {
      if (!userId) throw new ListingError(LISTING_SESSION_EXPIRED);
      return createListing({ ...input, userId }, { onStep: setStep, onActivityResolved });
    },
    onSettled: () => setStep(null),
  });
  return { ...mutation, step };
}

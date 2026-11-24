import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ListingSummary } from "@/services/listing-reads";
import { ListingCard } from "./ListingCard";

vi.mock("@/services/listing-reads", () => ({ listingPhotoUrl: (path: string) => `/${path}` }));

const listing: ListingSummary = {
  id: "l1",
  kind: "don",
  status: "disponible",
  createdAt: "2026-01-01T10:00:00Z",
  activityName: "Aquarelle",
  cityName: "Lyon",
  distanceKm: null,
  coverPath: "a.jpg",
  ownerName: null,
};

describe("ListingCard : focus clavier", () => {
  it("le contour du lien étendu n'est rogné par aucun ancêtre (pas d'overflow-hidden)", () => {
    render(
      <MemoryRouter>
        <ListingCard listing={listing} />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Aquarelle" });
    expect(link).toHaveClass("focus-visible:after:outline-2", "focus-visible:after:outline-ring");
    for (let el = link.parentElement; el; el = el.parentElement) {
      expect(el.className).not.toContain("overflow-hidden");
    }
    // Le rognage des coins de l'image reste sur le bloc image, hors du chemin du lien.
    expect(screen.getByRole("img").parentElement).toHaveClass("overflow-hidden", "rounded-t-xl");
  });
});

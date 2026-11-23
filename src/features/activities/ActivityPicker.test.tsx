import { useEffect, useState } from "react";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityValue } from "@/services/activities";
import { renderWithQuery } from "@/test/render";
import { supabaseMock } from "@/test/supabase-mock";
import { ActivityPicker } from "./ActivityPicker";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

function Harness({
  onChange,
  allowCreate,
}: {
  onChange?: (value: ActivityValue) => void;
  allowCreate?: boolean;
}) {
  const [value, setValue] = useState<ActivityValue>(null);
  return (
    <ActivityPicker
      allowCreate={allowCreate}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

function suggestions(...names: string[]) {
  supabaseMock.rpc.mockResolvedValue({
    data: names.map((name, index) => ({ id: `a${index}`, name, similarity: 0.5 })),
    error: null,
  });
}

beforeEach(() => {
  supabaseMock.resetMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("ActivityPicker", () => {
  it("liste les suggestions puis l'option Créer en dernier, et l'aide « Tu voulais dire »", async () => {
    suggestions("Crochet", "Crochets de porte");
    const user = setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox", { name: "Activité" }), "Crochat");

    await screen.findByRole("option", { name: "Crochet" });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Crochet",
      "Crochets de porte",
      "Créer « Crochat »",
    ]);
    expect(screen.getByRole("button", { name: "Tu voulais dire Crochet ?" })).toBeVisible();
  });

  it("allowCreate={false} : ni « Créer » ni « Tu voulais dire », les suggestions restent choisissables", async () => {
    suggestions("Crochet");
    const onChange = vi.fn();
    const user = setup();
    renderWithQuery(<Harness allowCreate={false} onChange={onChange} />);
    await user.type(screen.getByRole("combobox"), "Crochat");

    await screen.findByRole("option", { name: "Crochet" });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByRole("option", { name: /Créer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tu voulais dire/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Crochet" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "existing", id: "a0", name: "Crochet" });
  });

  it("allowCreate={false} sans résultat : « Aucun résultat » et pas de création", async () => {
    suggestions();
    const user = setup();
    renderWithQuery(<Harness allowCreate={false} />);
    await user.type(screen.getByRole("combobox"), "Zzzz");
    await screen.findByText("Aucun résultat", { selector: "[role=status]" });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("choisir « Créer » renvoie un nouveau nom nettoyé, sans rien écrire en base", async () => {
    suggestions();
    const onChange = vi.fn();
    const user = setup();
    renderWithQuery(<Harness onChange={onChange} />);
    await user.type(screen.getByRole("combobox"), "  Jeux   de rôle ");
    await user.click(await screen.findByRole("option", { name: "Créer « Jeux de rôle »" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "new", name: "Jeux de rôle" });
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Tu voulais dire/ })).not.toBeInTheDocument();
  });

  it("choisir une suggestion renvoie l'activité existante", async () => {
    suggestions("Crochet");
    const onChange = vi.fn();
    const user = setup();
    renderWithQuery(<Harness onChange={onChange} />);
    await user.type(screen.getByRole("combobox"), "Croch");
    await user.click(await screen.findByRole("option", { name: "Crochet" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "existing", id: "a0", name: "Crochet" });
  });

  it("« Tu voulais dire » est cliquable", async () => {
    suggestions("Crochet");
    const onChange = vi.fn();
    const user = setup();
    renderWithQuery(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Crochat");
    await user.click(await screen.findByRole("button", { name: /Tu voulais dire/ }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "existing", id: "a0", name: "Crochet" });
    expect(input).toHaveValue("Crochet");
  });

  it("égalité exacte insensible à la casse et aux accents : pas d'option Créer", async () => {
    suggestions("Échecs");
    const user = setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "echecs");
    expect(await screen.findByRole("option", { name: "Échecs" })).toBeVisible();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Tu voulais dire/ })).not.toBeInTheDocument();
  });

  it("limite la saisie à 60 caractères", () => {
    suggestions();
    renderWithQuery(<Harness />);
    expect(screen.getByRole("combobox")).toHaveAttribute("maxlength", "60");
  });

  it("ne propose pas « Créer » pour un nom sans caractère utile", async () => {
    suggestions();
    const user = setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "!!");
    await vi.waitFor(() => expect(supabaseMock.rpc).toHaveBeenCalled());
    await screen.findByText("Aucun résultat", { selector: "[role=status]" });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Créer/ })).not.toBeInTheDocument();
  });

  it("égalité exacte malgré ponctuation finale et ligature", async () => {
    suggestions("Œnologie");
    const user = setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "oenologie.");
    expect(await screen.findByRole("option", { name: "Œnologie" })).toBeVisible();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("ne propose « Créer » qu'une fois les résultats arrivés pour la saisie", async () => {
    let resolve: (value: unknown) => void = () => {};
    supabaseMock.rpc.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "Echecs");

    // Frappe stabilisée, requête en vol : ni « Créer » ni « Tu voulais dire ».
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("Recherche en cours…")).toBeInTheDocument();

    await act(async () =>
      resolve({ data: [{ id: "a0", name: "Échecs", similarity: 1 }], error: null }),
    );
    expect(await screen.findByRole("option", { name: "Échecs" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Créer/ })).not.toBeInTheDocument();
  });

  it("n'affiche pas « Créer » pendant la frappe avec des résultats périmés", async () => {
    suggestions("Crochet");
    const user = setup();
    renderWithQuery(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Crochet");
    await screen.findByRole("option", { name: "Crochet" });

    supabaseMock.rpc.mockReturnValue(new Promise(() => {}));
    await user.type(input, "s");
    expect(screen.queryByRole("option", { name: /Créer/ })).not.toBeInTheDocument();
  });

  it("affiche l'erreur de recherche", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const user = setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "Cro");
    await vi.waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("La recherche n'a pas abouti"),
    );
    // En erreur, on ne sait pas si l'activité existe : pas de « Créer ».
    expect(screen.queryByRole("option", { name: /Créer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tu voulais dire/ })).not.toBeInTheDocument();
  });

  it("suit la valeur modifiée de l'extérieur sans casser la frappe", async () => {
    suggestions();
    let set: (value: ActivityValue) => void = () => {};
    function Controlled() {
      const [value, setValue] = useState<ActivityValue>(null);
      useEffect(() => {
        set = setValue;
      }, []);
      return <ActivityPicker value={value} onChange={setValue} />;
    }
    const user = setup();
    renderWithQuery(<Controlled />);
    const input = screen.getByRole("combobox");

    await user.type(input, "Poterie");
    expect(input).toHaveValue("Poterie");

    act(() => set({ kind: "existing", id: "a1", name: "Crochet" }));
    expect(input).toHaveValue("Crochet");

    // Frappe après un choix : la valeur passe à null mais le texte tapé est conservé.
    await user.type(input, "x");
    expect(input).toHaveValue("Crochetx");

    act(() => set({ kind: "new", name: "Aquarelle" }));
    expect(input).toHaveValue("Aquarelle");
    act(() => set(null));
    expect(input).toHaveValue("");
  });
});

import { useEffect, useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox } from "./combobox";

const ALL = [
  { key: "1", label: "Crochet" },
  { key: "2", label: "Couture" },
  { key: "3", label: "Cuisine" },
];

function Harness({
  onSelect = () => {},
  loading = false,
  fetchError,
  empty = false,
}: {
  onSelect?: (key: string) => void;
  loading?: boolean;
  fetchError?: string;
  empty?: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <>
      <Combobox
        label="Activité"
        hint="Une aide"
        error="Une erreur"
        fetchError={fetchError}
        loading={loading}
        options={empty ? [] : ALL}
        inputValue={text}
        onInputChange={setText}
        onSelectOption={(option) => {
          setText(option.label);
          onSelect(option.key);
        }}
      />
      <button type="button">Autre</button>
    </>
  );
}

describe("Combobox", () => {
  it("expose les attributs ARIA du motif combobox avec listbox", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Activité" });
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(input).toHaveAccessibleDescription("Une aide Une erreur");

    await user.type(input, "C");
    expect(input).toHaveAttribute("aria-expanded", "false");

    await user.type(input, "r");
    expect(input).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("annonce le nombre de résultats dans une zone live polie", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("");
    await user.type(screen.getByRole("combobox"), "Cr");
    expect(status).toHaveTextContent("3 résultats");
  });

  it("annonce « Aucun résultat »", async () => {
    const user = userEvent.setup();
    render(<Harness empty />);
    await user.type(screen.getByRole("combobox"), "Zz");
    expect(screen.getByRole("status")).toHaveTextContent("Aucun résultat");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("affiche le chargement et l'erreur réseau", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness loading empty />);
    await user.type(screen.getByRole("combobox"), "Cr");
    expect(screen.getByText("Recherche en cours…")).toBeInTheDocument();

    rerender(<Harness fetchError="Panne réseau" empty />);
    // Texte visible + zone live.
    expect(screen.getAllByText("Panne réseau")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Panne réseau");
  });

  it("navigue aux flèches (avec bouclage) et choisit avec Entrée", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Cr");

    await user.keyboard("{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", options[0]?.id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options[2]?.id);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1]?.id);

    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("2");
    expect(input).toHaveValue("Couture");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("Entrée sans option active ne choisit rien", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    await user.type(screen.getByRole("combobox"), "Cr{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Échap ferme la liste sans effacer la saisie ; ArrowDown la rouvre", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Cr");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("Cr");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("choisit au clic en gardant le focus sur le champ", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Cr");
    await user.click(screen.getByRole("option", { name: "Cuisine" }));
    expect(onSelect).toHaveBeenCalledWith("3");
    expect(input).toHaveFocus();
  });

  it("ferme la liste quand le champ perd le focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("combobox"), "Cr");
    await user.click(screen.getByRole("button", { name: "Autre" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("Combobox : liste qui change sans frappe", () => {
  let load = () => {};
  function Changing() {
    const [text, setText] = useState("");
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      load = () => setLoaded(true);
    });
    const create = { key: "c", label: "Créer « Croch »", action: true };
    return (
      <Combobox
        label="Activité"
        options={loaded ? [{ key: "e", label: "Crochet" }, create] : [create]}
        inputValue={text}
        onInputChange={setText}
        onSelectOption={(option) => setText(option.label)}
      />
    );
  }

  it("garde l'option active (par clé) quand des résultats arrivent", async () => {
    const user = userEvent.setup();
    render(<Changing />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Croch");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0]?.id);

    // Les résultats arrivent : « Créer » passe au rang 1, il reste l'option active.
    act(() => load());
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Crochet", "Créer « Croch »"]);
    expect(input).toHaveAttribute("aria-activedescendant", options[1]?.id);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("ne compte pas les options d'action dans l'annonce", async () => {
    const user = userEvent.setup();
    render(<Changing />);
    await user.type(screen.getByRole("combobox"), "Croch");
    expect(screen.getByRole("status")).toHaveTextContent("Aucun résultat");
    act(() => load());
    expect(screen.getByRole("status")).toHaveTextContent("1 résultat");
  });
});

describe("Combobox : réouverture", () => {
  it("un clic dans le champ rouvre la liste si la saisie est assez longue", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Cr{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});

import { useEffect, useState } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { supabaseMock } from "@/test/supabase-mock";
import { CityPicker, type CityValue } from "./CityPicker";
import { formatCity } from "./format-city";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

const LYON = {
  id: "c-lyon",
  insee_code: "69123",
  name: "Lyon",
  postal_codes: ["69001", "69002", "69003"],
};
const ALBI = { id: "c-albi", insee_code: "81004", name: "Albi", postal_codes: ["81000"] };

function Harness({ onChange }: { onChange?: (value: CityValue | null) => void }) {
  const [value, setValue] = useState<CityValue | null>(null);
  return (
    <CityPicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  supabaseMock.resetMocks();
  supabaseMock.rpc.mockResolvedValue({ data: [LYON, ALBI], error: null });
});

describe("formatCity", () => {
  it("abrège au-delà de deux codes postaux", () => {
    expect(formatCity(LYON)).toBe("Lyon (69001, 69002…)");
    expect(formatCity(ALBI)).toBe("Albi (81000)");
    expect(formatCity({ ...ALBI, postal_codes: ["81000", "81001"] })).toBe("Albi (81000, 81001)");
    expect(formatCity({ ...ALBI, postal_codes: [] })).toBe("Albi");
  });
});

describe("CityPicker", () => {
  it("attend la fin de la frappe avant d'interroger le serveur", async () => {
    const user = setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox", { name: "Ville" }), "Lyon");
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(await screen.findByRole("option", { name: "Lyon (69001, 69002…)" })).toBeVisible();
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("search_cities", { q: "Lyon" });
    expect(screen.getByRole("option", { name: "Albi (81000)" })).toBeVisible();
  });

  it("n'interroge pas sous deux caractères", async () => {
    const user = setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "L");
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renvoie { id, name } au choix puis null quand on efface", async () => {
    const user = setup();
    const onChange = vi.fn();
    renderWithQuery(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Ly");
    await user.click(await screen.findByRole("option", { name: /Lyon/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      id: "c-lyon",
      name: "Lyon",
      postal_codes: LYON.postal_codes,
    });
    expect(input).toHaveValue("Lyon");

    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("affiche une erreur de recherche", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const user = setup();
    renderWithQuery(<Harness />);
    await user.type(screen.getByRole("combobox"), "Ly");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("La recherche n'a pas abouti"),
    );
  });

  it("suit la valeur modifiée de l'extérieur (reset, pré-remplissage)", async () => {
    let set: (value: CityValue | null) => void = () => {};
    function Controlled() {
      const [value, setValue] = useState<CityValue | null>(null);
      useEffect(() => {
        set = setValue;
      }, []);
      return <CityPicker value={value} onChange={setValue} />;
    }
    renderWithQuery(<Controlled />);
    const input = screen.getByRole("combobox");
    act(() => set({ id: "c-albi", name: "Albi", postal_codes: ["81000"] }));
    expect(input).toHaveValue("Albi");
    act(() => set(null));
    expect(input).toHaveValue("");
  });
});

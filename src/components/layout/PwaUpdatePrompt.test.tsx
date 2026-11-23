import { render, screen } from "@testing-library/react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { usePwaUpdate } from "@/features/pwa/pwa-update-context";
import { PwaUpdatePrompt } from "./PwaUpdatePrompt";

vi.mock("virtual:pwa-register/react", () => ({ useRegisterSW: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(
    vi.fn(() => "t1"),
    { dismiss: vi.fn() },
  ),
}));

function Probe() {
  const { needRefresh, updateServiceWorker } = usePwaUpdate();
  return (
    <button type="button" onClick={() => void updateServiceWorker(true)}>
      {needRefresh ? "à recharger" : "à jour"}
    </button>
  );
}

function mockRegister(needRefresh: boolean) {
  const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useRegisterSW).mockReturnValue({
    needRefresh: [needRefresh, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  });
  return updateServiceWorker;
}

describe("PwaUpdatePrompt", () => {
  it("partage needRefresh et updateServiceWorker de l'unique inscription", async () => {
    const update = mockRegister(true);
    render(
      <PwaUpdatePrompt>
        <Probe />
      </PwaUpdatePrompt>,
    );
    const button = screen.getByRole("button", { name: "à recharger" });
    button.click();
    expect(update).toHaveBeenCalledWith(true);
    expect(useRegisterSW).toHaveBeenCalledTimes(1);
  });

  it("à jour : needRefresh est faux", () => {
    mockRegister(false);
    render(
      <PwaUpdatePrompt>
        <Probe />
      </PwaUpdatePrompt>,
    );
    expect(screen.getByRole("button", { name: "à jour" })).toBeVisible();
  });
});

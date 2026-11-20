import { randomId } from "./random-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomId", () => {
  it("renvoie un UUID v4", () => {
    expect(randomId()).toMatch(UUID);
  });

  it("se replie sur getRandomValues quand randomUUID est absent", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      const ids = [randomId(), randomId()];
      ids.forEach((id) => expect(id).toMatch(UUID));
      expect(ids[0]).not.toBe(ids[1]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

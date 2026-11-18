import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthRetryableFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { fakeJwt, fakeSession, supabaseMock } from "@/test/supabase-mock";
import { renderApp } from "@/test/render";
import { routes } from "./routes";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("@/test/supabase-mock")).supabaseMock,
}));

function mockProfile(profile: { display_name: string; display_name_confirmed: boolean } | null) {
  supabaseMock.rpc.mockReturnValue({
    maybeSingle: () =>
      Promise.resolve({
        data: profile && { id: "user-1", city_id: null, ...profile },
        error: null,
      }),
  });
}

beforeEach(() => {
  supabaseMock.resetMocks();
  localStorage.clear();
});

describe("connexion par email puis code", () => {
  it("envoie le code, valide, puis redirige quand la session apparaît", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(routes, "/connexion");

    await user.type(await screen.findByLabelText("Ton email"), "moi@example.com");
    await user.click(screen.getByRole("button", { name: "Recevoir un code" }));

    expect(supabaseMock.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "moi@example.com",
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirmation`,
        shouldCreateUser: true,
      },
    });
    const codeInput = await screen.findByLabelText("Code à 8 chiffres");
    expect(codeInput).toHaveAttribute("autocomplete", "one-time-code");
    expect(codeInput).toHaveAttribute("inputmode", "numeric");

    // Collage avec espace accepté.
    await user.click(codeInput);
    await user.paste("1234 5678");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    await waitFor(() =>
      expect(supabaseMock.auth.verifyOtp).toHaveBeenCalledWith({
        email: "moi@example.com",
        token: "12345678",
        type: "email",
      }),
    );
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    supabaseMock.setSession(fakeSession(), "SIGNED_IN");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("garde la saisie et affiche l'erreur si le code est refusé", async () => {
    supabaseMock.auth.verifyOtp.mockResolvedValue({
      error: { code: "otp_expired", status: 403, message: "Token has expired" },
    });
    const user = userEvent.setup();
    renderApp(routes, "/connexion");

    await user.type(await screen.findByLabelText("Ton email"), "moi@example.com");
    await user.click(screen.getByRole("button", { name: "Recevoir un code" }));
    const codeInput = await screen.findByLabelText("Code à 8 chiffres");
    await user.type(codeInput, "00000000");
    await user.click(screen.getByRole("button", { name: "Valider" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/pas bon ou a expiré/);
    expect(codeInput).toHaveValue("00000000");
    expect(codeInput).toHaveAttribute("aria-invalid", "true");
    expect(codeInput).toHaveAccessibleDescription(/pas bon ou a expiré/);
  });

  it("refuse un code incomplet sans appeler le serveur", async () => {
    const user = userEvent.setup();
    renderApp(routes, "/connexion");
    await user.type(await screen.findByLabelText("Ton email"), "moi@example.com");
    await user.click(screen.getByRole("button", { name: "Recevoir un code" }));
    await user.type(await screen.findByLabelText("Code à 8 chiffres"), "123");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    expect(await screen.findByText("Le code a 8 chiffres")).toBeInTheDocument();
    expect(supabaseMock.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("garde l'email saisi si l'envoi échoue", async () => {
    supabaseMock.auth.signInWithOtp.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429, message: "rate" },
    });
    const user = userEvent.setup();
    renderApp(routes, "/connexion");
    const email = await screen.findByLabelText("Ton email");
    await user.type(email, "moi@example.com");
    await user.click(screen.getByRole("button", { name: "Recevoir un code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Patiente un peu/);
    expect(email).toHaveValue("moi@example.com");
  });
});

describe("gardes de routes", () => {
  it("renvoie un visiteur vers /connexion en mémorisant la page demandée", async () => {
    const { router } = renderApp(routes, "/profil");
    await waitFor(() => expect(router.state.location.pathname).toBe("/connexion"));
    expect(router.state.location.search).toBe("?suivant=%2Fprofil");
    expect(screen.getByRole("heading", { name: "Connexion" })).toBeInTheDocument();
  });

  it("renvoie vers /bienvenue tant que le pseudo n'est pas confirmé", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Membre-1A2B", display_name_confirmed: false });
    const { router } = renderApp(routes, "/profil");
    expect(await screen.findByRole("heading", { name: "Bienvenue !" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/bienvenue");
    expect(router.state.location.search).toBe("?suivant=%2Fprofil");
    expect(screen.getByLabelText("Ton pseudo")).toHaveValue("Membre-1A2B");
  });

  it("laisse passer un profil confirmé", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    renderApp(routes, "/profil");
    expect(await screen.findByRole("heading", { name: "Mon profil" })).toBeInTheDocument();
  });

  it("renvoie un profil déjà confirmé de /bienvenue vers la page demandée", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    const { router } = renderApp(routes, "/bienvenue?suivant=%2Fprofil");
    await waitFor(() => expect(router.state.location.pathname).toBe("/profil"));
  });

  it("renvoie un utilisateur connecté de /connexion vers l'accueil", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    const { router } = renderApp(routes, "/connexion?suivant=https%3A%2F%2Fevil.example");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("enregistre le pseudo à l'onboarding puis revient à la page demandée", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Membre-1A2B", display_name_confirmed: false });
    const select = vi.fn().mockImplementation(async () => {
      mockProfile({ display_name: "Alex", display_name_confirmed: true });
      return { data: [{ id: "user-1", display_name: "Alex" }], error: null };
    });
    supabaseMock.from.mockReturnValue({ update: () => ({ eq: () => ({ select }) }) });
    const user = userEvent.setup();
    const { router } = renderApp(routes, "/bienvenue?suivant=%2Fprofil");

    const field = await screen.findByLabelText("Ton pseudo");
    await user.clear(field);
    await user.type(field, "Alex");
    await user.click(screen.getByRole("button", { name: "C'est parti" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/profil"));
  });

  it("affiche l'erreur de pseudo sans vider le champ", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Membre-1A2B", display_name_confirmed: false });
    supabaseMock.from.mockReturnValue({
      update: () => ({
        eq: () => ({
          select: () =>
            Promise.resolve({
              data: null,
              error: { code: "23514", message: "Ce pseudo n'est pas disponible" },
            }),
        }),
      }),
    });
    const user = userEvent.setup();
    renderApp(routes, "/bienvenue");
    const field = await screen.findByLabelText("Ton pseudo");
    await user.clear(field);
    await user.type(field, "Admin");
    await user.click(screen.getByRole("button", { name: "C'est parti" }));
    expect(await screen.findByText("Ce pseudo n'est pas disponible")).toBeInTheDocument();
    expect(field).toHaveValue("Admin");
    expect(field).toHaveAttribute("aria-invalid", "true");
  });
});

describe("confirmation par lien", () => {
  it("affiche un message propre sans paramètre", async () => {
    renderApp(routes, "/auth/confirmation");
    expect(
      await screen.findByRole("heading", { name: "Ce lien ne fonctionne plus" }),
    ).toBeVisible();
    expect(supabaseMock.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("vérifie token_hash, nettoie l'URL puis redirige", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { router } = renderApp(routes, "/auth/confirmation?token_hash=abc&type=email");
    await waitFor(() =>
      expect(supabaseMock.auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: "abc",
        type: "email",
      }),
    );
    expect(replaceState).toHaveBeenCalled();
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    supabaseMock.setSession(fakeSession(), "SIGNED_IN");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("affiche l'erreur si le jeton est refusé", async () => {
    supabaseMock.auth.verifyOtp.mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    renderApp(routes, "/auth/confirmation?token_hash=abc&type=email");
    expect(
      await screen.findByRole("heading", { name: "Ce lien ne fonctionne plus" }),
    ).toBeVisible();
  });
});

describe("retour Google", () => {
  it("gère ?error=", async () => {
    renderApp(routes, "/auth/callback?error=access_denied&error_description=denied");
    expect(await screen.findByRole("heading", { name: "Connexion annulée" })).toBeVisible();
  });
});

describe("suppression de compte", () => {
  const confirmedProfile = () =>
    mockProfile({ display_name: "Alex", display_name_confirmed: true });

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
  }

  it("supprime le compte, purge la session locale et revient à l'accueil", async () => {
    supabaseMock.setSession(fakeSession());
    confirmedProfile();
    supabaseMock.functions.invoke.mockResolvedValue({ data: { deleted: true }, error: null });
    const user = userEvent.setup();
    const { router } = renderApp(routes, "/profil");

    await openDialog(user);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/ton profil, tes photos/);
    expect(dialog).toHaveTextContent(/messages/);
    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith("delete-account", {
      method: "POST",
    });
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
  });

  it("demande une ré-authentification à l'avance si la connexion est ancienne", async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    supabaseMock.setSession(fakeSession({ amrTimestamp: old }));
    confirmedProfile();
    const user = userEvent.setup();
    renderApp(routes, "/profil");

    await openDialog(user);
    expect(await screen.findByText(/confirme que c'est bien toi/)).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Recevoir un code par email" }));
    expect(supabaseMock.auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "moi@example.com",
        options: expect.objectContaining({ shouldCreateUser: false }),
      }),
    );
    await user.type(await screen.findByLabelText("Code à 8 chiffres"), "12345678");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    await waitFor(() =>
      expect(supabaseMock.auth.verifyOtp).toHaveBeenCalledWith({
        email: "moi@example.com",
        token: "12345678",
        type: "email",
      }),
    );
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("gère un 401 reauth_required renvoyé malgré tout", async () => {
    supabaseMock.setSession(fakeSession());
    confirmedProfile();
    supabaseMock.functions.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: "reauth_required" }), { status: 401 }),
      ),
    });
    const user = userEvent.setup();
    renderApp(routes, "/profil");

    await openDialog(user);
    await user.click(await screen.findByRole("button", { name: "Supprimer définitivement" }));
    expect(await screen.findByText(/Ta connexion date un peu/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recevoir un code par email" })).toBeInTheDocument();
    expect(supabaseMock.auth.signOut).not.toHaveBeenCalled();
  });

  it("propose « Réessayer » après une erreur 500", async () => {
    supabaseMock.setSession(fakeSession());
    confirmedProfile();
    supabaseMock.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: "delete_user_failed" }), { status: 500 }),
      ),
    });
    supabaseMock.functions.invoke.mockResolvedValueOnce({ data: { deleted: true }, error: null });
    const user = userEvent.setup();
    const { router } = renderApp(routes, "/profil");

    await openDialog(user);
    await user.click(await screen.findByRole("button", { name: "Supprimer définitivement" }));
    await user.click(await screen.findByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(2);
  });
});

describe("connexion : cas supplémentaires", () => {
  it("lance Google avec redirectTo /auth/callback (sans query string superflue)", async () => {
    const user = userEvent.setup();
    renderApp(routes, "/connexion");
    await user.click(await screen.findByRole("button", { name: "Continuer avec Google" }));
    expect(supabaseMock.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  });

  it("annonce un trop grand nombre d'essais (429 sur verifyOtp)", async () => {
    supabaseMock.auth.verifyOtp.mockResolvedValue({
      error: { code: "over_request_rate_limit", status: 429, message: "rate" },
    });
    const user = userEvent.setup();
    renderApp(routes, "/connexion");
    await user.type(await screen.findByLabelText("Ton email"), "moi@example.com");
    await user.click(screen.getByRole("button", { name: "Recevoir un code" }));
    await user.type(await screen.findByLabelText("Code à 8 chiffres"), "12345678");
    await user.click(screen.getByRole("button", { name: "Valider" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Trop d'essais/);
  });

  it("envoie un connecté au pseudo non confirmé directement sur /bienvenue", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Membre-1A2B", display_name_confirmed: false });
    const { router } = renderApp(routes, "/connexion?suivant=%2Fprofil");
    await waitFor(() => expect(router.state.location.pathname).toBe("/bienvenue"));
    expect(router.state.location.search).toBe("?suivant=%2Fprofil");
  });
});

describe("pseudo : erreurs serveur dans l'interface", () => {
  async function submitWith(error: { code: string; message?: string; status?: number }) {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Membre-1A2B", display_name_confirmed: false });
    supabaseMock.from.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => Promise.resolve({ data: null, error }) }) }),
    });
    const user = userEvent.setup();
    renderApp(routes, "/bienvenue");
    const field = await screen.findByLabelText("Ton pseudo");
    await user.clear(field);
    await user.type(field, "Alex");
    await user.click(screen.getByRole("button", { name: "C'est parti" }));
    return field;
  }

  it("23505 : pseudo déjà pris", async () => {
    const field = await submitWith({ code: "23505" });
    expect(await screen.findByText("Ce pseudo est déjà pris")).toBeInTheDocument();
    expect(field).toHaveValue("Alex");
  });

  it("PT429 : message du serveur", async () => {
    const field = await submitWith({
      code: "PT429",
      status: 429,
      message: "Tu changes de pseudo trop souvent.",
    });
    expect(await screen.findByText("Tu changes de pseudo trop souvent.")).toBeInTheDocument();
    expect(field).toHaveValue("Alex");
  });
});

describe("profil indisponible", () => {
  it("erreur sans données : message et « Réessayer »", async () => {
    supabaseMock.setSession(fakeSession());
    supabaseMock.rpc.mockReturnValue({
      maybeSingle: () => Promise.resolve({ data: null, error: { code: "500", message: "boom" } }),
    });
    renderApp(routes, "/profil");
    expect(await screen.findByText(/On n'arrive pas à charger ton profil/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("erreur de refetch avec données : la page reste affichée", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    const { queryClient } = renderApp(routes, "/profil");
    await screen.findByRole("heading", { name: "Mon profil" });
    supabaseMock.rpc.mockReturnValue({
      maybeSingle: () => Promise.resolve({ data: null, error: { code: "500", message: "boom" } }),
    });
    await act(() => queryClient.invalidateQueries());
    expect(screen.getByRole("heading", { name: "Mon profil" })).toBeInTheDocument();
    expect(screen.queryByText(/On n'arrive pas à charger/)).not.toBeInTheDocument();
  });

  it("profil à 0 ligne : message dédié et déconnexion locale", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile(null);
    const user = userEvent.setup();
    const { router } = renderApp(routes, "/profil");
    expect(await screen.findByText(/On ne retrouve pas ton profil/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(supabaseMock.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("déconnexion", () => {
  it("revient à l'accueil, déconnexion locale, cache vidé", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    supabaseMock.auth.signOut.mockImplementation(async () => {
      supabaseMock.setSession(null, "SIGNED_OUT");
      return { error: null };
    });
    const user = userEvent.setup();
    const { router, queryClient } = renderApp(routes, "/profil");
    await user.click(await screen.findByRole("button", { name: "Se déconnecter" }));
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
    await waitFor(() => expect(queryClient.getQueryData(["profile", "user-1"])).toBeUndefined());
    expect(router.state.location.pathname).toBe("/");
    expect(await screen.findByRole("link", { name: "Connexion" })).toBeInTheDocument();
  });
});

describe("lien de confirmation : réseau", () => {
  it("propose « Réessayer » sur une erreur réseau, sans parler de lien expiré", async () => {
    supabaseMock.auth.verifyOtp.mockResolvedValueOnce({
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    const user = userEvent.setup();
    const { router } = renderApp(routes, "/auth/confirmation?token_hash=abc&type=email");
    expect(await screen.findByRole("heading", { name: /Pas de connexion/ })).toBeInTheDocument();
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(supabaseMock.auth.verifyOtp).toHaveBeenCalledTimes(2));
    supabaseMock.setSession(fakeSession(), "SIGNED_IN");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("suppression : l'URL ne suffit jamais", () => {
  const setup = (path: string) => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    return renderApp(routes, path);
  };
  const intent = (userId: string, ageMs = 0) =>
    localStorage.setItem(
      "adhd-material:suppression",
      JSON.stringify({ userId, at: Date.now() - ageMs }),
    );

  it("paramètre d'URL seul : pas de dialogue", async () => {
    setup("/profil?suppression=1");
    expect(await screen.findByRole("button", { name: "Supprimer mon compte" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("intention d'un autre utilisateur : pas de dialogue, intention effacée", async () => {
    intent("autre-utilisateur");
    setup("/profil");
    expect(await screen.findByRole("button", { name: "Supprimer mon compte" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("adhd-material:suppression")).toBeNull();
  });

  it("intention expirée : pas de dialogue", async () => {
    intent("user-1", 11 * 60 * 1000);
    setup("/profil");
    expect(await screen.findByRole("button", { name: "Supprimer mon compte" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("intention valide : dialogue avec le compte concerné", async () => {
    intent("user-1");
    setup("/profil");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Alex");
    expect(dialog).toHaveTextContent("moi@example.com");
    expect(dialog).toHaveTextContent(/adresse email/);
  });

  it("ré-authentification dans un autre onglet : l'onglet d'origine passe à la confirmation", async () => {
    supabaseMock.setSession(fakeSession({ amrTimestamp: Math.floor(Date.now() / 1000) - 3600 }));
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    const user = userEvent.setup();
    renderApp(routes, "/profil");
    await user.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    await user.click(await screen.findByRole("button", { name: "Recevoir un code par email" }));
    await screen.findByLabelText("Code à 8 chiffres");
    expect(localStorage.getItem("adhd-material:suppression")).toContain("user-1");

    await act(async () => supabaseMock.setSession(fakeSession(), "SIGNED_IN"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("session d'un autre compte après la ré-authentification : pas de dialogue", async () => {
    supabaseMock.setSession(
      fakeSession({ amrTimestamp: Math.floor(Date.now() / 1000) - 3600, providers: ["google"] }),
    );
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    const user = userEvent.setup();
    renderApp(routes, "/profil");
    await user.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    await user.click(await screen.findByRole("button", { name: "Recevoir un code par email" }));
    await screen.findByLabelText("Code à 8 chiffres");
    await act(async () => supabaseMock.setSession(fakeSession({ id: "user-2" }), "SIGNED_IN"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("Google : proposé seulement si lié au compte, avec select_account", async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    supabaseMock.setSession(fakeSession({ amrTimestamp: old, providers: ["email", "google"] }));
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    const user = userEvent.setup();
    renderApp(routes, "/profil");
    await user.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    await user.click(await screen.findByRole("button", { name: "Passer par Google" }));
    expect(supabaseMock.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    expect(localStorage.getItem("adhd-material:suppression")).toContain("user-1");
  });

  it("pas de bouton Google si aucune identité Google n'est liée", async () => {
    supabaseMock.setSession(fakeSession({ amrTimestamp: Math.floor(Date.now() / 1000) - 3600 }));
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    const user = userEvent.setup();
    renderApp(routes, "/profil");
    await user.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    await screen.findByRole("button", { name: "Recevoir un code par email" });
    expect(screen.queryByRole("button", { name: "Passer par Google" })).not.toBeInTheDocument();
  });

  it("le serveur fait foi : 401 reauth_required avec une horloge « fraîche » ne boucle pas", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: "reauth_required" }), { status: 401 }),
      ),
    });
    const user = userEvent.setup();
    renderApp(routes, "/profil");
    await user.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer définitivement" }));
    const notice = await screen.findByText(/Ta connexion date un peu/);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(notice.closest("p")).toHaveFocus());
    expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(1);
  });
});

describe("suppression : jeton rafraîchi et retour arrière", () => {
  it("un TOKEN_REFRESHED avec le même amr ne rouvre pas le dialogue après un refus serveur", async () => {
    const authAt = Math.floor(Date.now() / 1000);
    supabaseMock.setSession(fakeSession({ amrTimestamp: authAt }));
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    supabaseMock.functions.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: "reauth_required" }), { status: 401 }),
      ),
    });
    const user = userEvent.setup();
    renderApp(routes, "/profil");
    await user.click(await screen.findByRole("button", { name: "Supprimer mon compte" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer définitivement" }));
    await screen.findByText(/Ta connexion date un peu/);
    await user.click(screen.getByRole("button", { name: "Recevoir un code par email" }));
    await screen.findByLabelText("Code à 8 chiffres");

    const refreshed = fakeSession({ amrTimestamp: authAt });
    refreshed.access_token = fakeJwt({
      sub: "user-1",
      iat: 2,
      amr: [{ method: "otp", timestamp: authAt }],
    });
    await act(async () => supabaseMock.setSession(refreshed, "TOKEN_REFRESHED"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Code à 8 chiffres")).toBeInTheDocument();
  });

  it("la confirmation ne se rouvre pas après démontage puis remontage", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    localStorage.setItem(
      "adhd-material:suppression",
      JSON.stringify({ userId: "user-1", at: Date.now() }),
    );
    const { router } = renderApp(routes, "/profil");
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await act(() => router.navigate("/"));
    await act(() => router.navigate("/profil"));
    expect(await screen.findByRole("button", { name: "Supprimer mon compte" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("page demandée mémorisée", () => {
  const stored = () => localStorage.getItem("adhd-material:suivant");
  const remember = () =>
    localStorage.setItem(
      "adhd-material:suivant",
      JSON.stringify({ path: "/profil", at: Date.now() }),
    );

  it("est effacée à la déconnexion", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    renderApp(routes, "/");
    await screen.findByRole("link", { name: "Alex" });
    remember();
    await act(async () => supabaseMock.setSession(null, "SIGNED_OUT"));
    expect(stored()).toBeNull();
  });

  it("est effacée quand un autre compte se connecte", async () => {
    supabaseMock.setSession(fakeSession());
    mockProfile({ display_name: "Alex", display_name_confirmed: true });
    renderApp(routes, "/");
    await screen.findByRole("link", { name: "Alex" });
    remember();
    await act(async () => supabaseMock.setSession(fakeSession({ id: "user-2" }), "SIGNED_IN"));
    expect(stored()).toBeNull();
  });
});

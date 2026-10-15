import { useMemo, useState, type FocusEvent, type FormEvent, type InputHTMLAttributes } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Logo } from "../components/ui/Logo";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { Loading } from "../components/ui/Loading";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useFetchData } from "../hooks/useFetchData";
import { getRoster, type RosterPlayer } from "../services/playersService";
import type { LoginIdentifier } from "../services/authService";
import { ApiError } from "../services/api";
import { entryPathForUser } from "../utils/playerEntry";
import { useTheme } from "../hooks/useTheme";
import { PlayerCardDeck } from "../components/login/PlayerCardDeck";
import { TrucoPlayerCard } from "../components/login/TrucoPlayerCard";
import { playerCardIdentity, type PlayerCardIdentity } from "../components/login/playerCardIdentity";
// O PNG original (1536px, 2 MB) segue no repositório como fonte, mas não é
// mais importado: o que vai para o bundle são estas duas versões em 1120px —
// o dobro dos 560px em que a imagem é exibida, o suficiente para tela 2x.
import heroImageAvif from "../assets/truco-5-edicao.avif";
import heroImageWebp from "../assets/truco-5-edicao.webp";
import lightHeroImage from "../assets/truco-5-edicao.png";
import "./LoginPage.css";

/** Teclado do celular: o campo em foco sobe para o meio da tela, junto com o aviso logo abaixo dele. */
function keepFieldVisible(event: FocusEvent<HTMLInputElement>) {
  const field = event.currentTarget;
  if (!window.matchMedia("(max-width: 600px)").matches) return;
  window.setTimeout(() => field.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
}

/** Campo de senha com o olho para mostrar/ocultar o que foi digitado. */
function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="login-password">
      <input {...props} type={visible ? "text" : "password"} onFocus={keepFieldVisible} />
      <button type="button" className="login-password-toggle" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Ocultar o que foi digitado" : "Mostrar o que foi digitado"} aria-pressed={visible}>
        <Icon name={visible ? "eye-off" : "eye"} size={20} />
      </button>
    </span>
  );
}

const byName = (a: RosterPlayer, b: RosterPlayer) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

const ADMIN_IDENTITY: Identity = { name: "Administrador", credential: { email: "admin@trucodonovo.com" } };

/**
 * deck: cartas dos jogadores (entrada); players: lista simples de nomes; password: autenticação;
 * setup: primeiro acesso da 5ª edição, quando a conta ainda não criou a senha.
 */
type Step = "deck" | "players" | "password" | "setup";

interface Identity {
  name: string;
  /** Como o backend identifica quem está entrando: e-mail (admin) ou playerId (jogador). */
  credential: LoginIdentifier;
  /** Carta do jogador escolhido — só visual; o admin entra sem carta. */
  card?: PlayerCardIdentity;
}

export function LoginPage() {
  const { user, isLoading, login, createFirstPassword } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("deck");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerQuery, setPlayerQuery] = useState("");
  /** Última carta escolhida: ao voltar da senha, o baralho reabre nela. */
  const [lastPlayerId, setLastPlayerId] = useState<string | null>(null);

  const { data: roster, isLoading: playersLoading, error: playersError, refetch: refetchPlayers } = useFetchData<RosterPlayer[]>(getRoster, []);
  // Baralho e lista na mesma ordem alfabética.
  const players = useMemo(() => roster ? [...roster].sort(byName) : roster, [roster]);

  if (!isLoading && user) {
    return <Navigate to={user.mustChangePassword ? "/criar-senha" : entryPathForUser(user)} replace />;
  }

  function chooseAdmin() {
    setIdentity(ADMIN_IDENTITY);
    setStep("password");
  }

  // Escolher a carta só identifica quem vai entrar: a senha é pedida em seguida, sempre.
  function choosePlayer(player: RosterPlayer) {
    setIdentity({ name: player.name, credential: { playerId: player.id }, card: playerCardIdentity(player) });
    setLastPlayerId(player.id);
    setError(null);
    setPassword("");
    setConfirmation("");
    setStep(player.needsSetup ? "setup" : "password");
  }

  function backToDeck() {
    setError(null);
    setPassword("");
    setPlayerQuery("");
    setStep("deck");
  }

  const visiblePlayers = players?.filter((player) =>
    player.name.toLowerCase().includes(playerQuery.trim().toLowerCase()),
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!identity) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const loggedInUser = await login(identity.credential, password);
      showToast("success", `Bem-vindo, ${loggedInUser.name}!`);
      if (loggedInUser.mustChangePassword) {
        navigate("/criar-senha", { replace: true });
      } else {
        navigate(entryPathForUser(loggedInUser), { replace: true });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível entrar. Tente novamente.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const isPlayerIdentity = identity !== null && "playerId" in identity.credential;
  const setupMismatch = confirmation.length > 0 && password !== confirmation;
  const shortBy = password.length > 0 && password.length < 6 ? 6 - password.length : 0;

  async function handleSetup(event: FormEvent) {
    event.preventDefault();
    if (!identity || !("playerId" in identity.credential) || password !== confirmation) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const loggedInUser = await createFirstPassword(identity.credential.playerId!, password);
      showToast("success", `Senha criada! Bem-vindo, ${loggedInUser.name}!`);
      navigate(entryPathForUser(loggedInUser), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Alguém já criou a senha desta conta (talvez o próprio jogador em outro aparelho).
        setPassword("");
        setConfirmation("");
        setStep("password");
        refetchPlayers();
      }
      setError(err instanceof ApiError ? err.message : "Não foi possível criar a senha. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "deck") {
    return (
      <div className="login-page login-page-deck">
        <div className="login-theme-toggle"><ThemeToggle /></div>
        {/* Pôster da edição ao fundo do ambiente, na versão do tema escolhido. */}
        <div className="login-backdrop">
          {theme === "light" ? (
            <img src={lightHeroImage} alt="Truco do Novo — 5ª Edição" className="login-backdrop-image" width={1536} height={1024} />
          ) : (
            <picture>
              <source srcSet={heroImageAvif} type="image/avif" />
              <img src={heroImageWebp} alt="Truco do Novo — 5ª Edição" className="login-backdrop-image" width={1120} height={747} />
            </picture>
          )}
        </div>

        <div className="login-deck-layout page-enter">
          <header className="login-deck-header">
            <div className="login-brand">
              <Logo size={36} />
            </div>
            <h1>Quem está entrando para jogar?</h1>
            <p>Escolha sua carta para entrar no campeonato.</p>
          </header>

          {playersLoading ? (
            <Loading label="Embaralhando as cartas..." />
          ) : playersError ? (
            <div className="login-deck-message" role="alert">
              <p>Não foi possível carregar os jogadores agora.</p>
              <Button variant="secondary" onClick={refetchPlayers}>Tentar novamente</Button>
            </div>
          ) : players && players.length > 0 ? (
            <PlayerCardDeck players={players} initialPlayerId={lastPlayerId} onConfirm={choosePlayer} />
          ) : (
            <p className="login-deck-message text-muted">Nenhum jogador cadastrado nesta edição ainda.</p>
          )}

          <nav className="login-deck-links" aria-label="Outras formas de entrar">
            {players && players.length > 0 && (
              <button type="button" onClick={() => setStep("players")}>Ver lista de nomes</button>
            )}
            <button type="button" onClick={chooseAdmin}>
              <Icon name="settings" size={16} />
              Área administrativa
            </button>
          </nav>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page page-enter">
      <div className="login-theme-toggle"><ThemeToggle /></div>
      <div className="login-decor" aria-hidden="true">
        <span>♠</span>
        <span>♣</span>
        <span>♦</span>
        <span>♥</span>
      </div>

      <div className="login-content">
        <div className="login-brand">
          <Logo size={40} />
        </div>

        {step === "players" && (
          <div className="login-step">
            <button type="button" className="login-back" onClick={backToDeck}>
              ← Voltar às cartas
            </button>
            <h1>Selecione seu nome</h1>
            <p className="text-muted">Toque no seu nome para continuar</p>

            {playersLoading ? (
              <Loading label="Carregando jogadores..." />
            ) : (
              <>
                {(players?.length ?? 0) > 8 && (
                  <input
                    type="search"
                    className="login-search"
                    value={playerQuery}
                    onChange={(event) => setPlayerQuery(event.target.value)}
                    placeholder="Buscar pelo nome..."
                    aria-label="Buscar jogador pelo nome"
                  />
                )}

                {visiblePlayers && visiblePlayers.length > 0 ? (
                  <div className="profile-grid">
                    {visiblePlayers.map((player) => (
                      <button key={player.id} type="button" className="profile-card" onClick={() => choosePlayer(player)}>
                        <span className="profile-avatar">{player.name.slice(0, 1).toUpperCase()}</span>
                        <span className="profile-name">{player.name}</span>
                        {player.needsSetup && <span className="profile-setup">Criar senha</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-faint login-no-results">Nenhum jogador encontrado para "{playerQuery}".</p>
                )}
              </>
            )}
          </div>
        )}

        {step === "setup" && identity && (
          <div className={`login-step login-step-password${identity.card ? " login-auth" : ""}`}>
            <button type="button" className="login-back" onClick={backToDeck}>
              ← Voltar às cartas
            </button>
            <div className="login-auth-identity">
              {identity.card && (
                <div className="login-auth-card">
                  <TrucoPlayerCard name={identity.name} identity={identity.card} />
                </div>
              )}
              <span className="login-auth-kicker">Primeiro acesso</span>
              <h1 className="login-setup-title">Crie sua senha para a 5ª&nbsp;Edição</h1>
              <p className="text-muted">{identity.name}, escolha a senha que quiser. É ela que você vai usar nas próximas entradas.</p>
            </div>
            <form onSubmit={handleSetup} className="login-form" aria-label="Crie sua senha">
              <div className="login-field">
                <label htmlFor="login-new-password">Nova senha</label>
                <PasswordInput id="login-new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required autoFocus autoComplete="new-password" aria-describedby="login-new-password-hint" />
                <p id="login-new-password-hint" className={`login-field-hint${shortBy > 0 ? " is-warning" : ""}`}>
                  {shortBy > 0 ? `Faltam ${shortBy} caractere${shortBy === 1 ? "" : "s"}.` : "Pelo menos 6 caracteres. Só você deve saber esta senha."}
                </p>
              </div>
              <div className="login-field">
                <label htmlFor="login-confirm-password">Repita a senha</label>
                <PasswordInput id="login-confirm-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={6} required autoComplete="new-password" aria-invalid={setupMismatch} aria-describedby={setupMismatch ? "login-confirm-error" : undefined} />
                {setupMismatch && <p id="login-confirm-error" className="login-field-error" role="alert">As duas senhas não são iguais. Confira e digite de novo.</p>}
              </div>
              {error && <p className="login-error" role="alert">{error}</p>}
              <Button type="submit" isLoading={isSubmitting} disabled={password.length < 6 || password !== confirmation} className="login-submit">
                Criar senha e entrar
              </Button>
            </form>
            <button type="button" className="login-switch-user" onClick={backToDeck}>
              Não é você? Escolher outra carta
            </button>
          </div>
        )}

        {step === "password" && identity && (
          <div className={`login-step login-step-password${identity.card ? " login-auth" : ""}`}>
            <button type="button" className="login-back" onClick={backToDeck}>
              ← Voltar às cartas
            </button>

            {identity.card ? (
              <div className="login-auth-identity">
                <div className="login-auth-card">
                  <TrucoPlayerCard name={identity.name} identity={identity.card} />
                </div>
                <span className="login-auth-kicker">Entrando como</span>
                <h1>{identity.name}</h1>
                <p className="text-muted">Digite sua senha para confirmar que é você.</p>
              </div>
            ) : (
              <div className="password-identity">
                <span className="profile-avatar profile-avatar-lg">{identity.name.slice(0, 1).toUpperCase()}</span>
                <h1>{identity.name}</h1>
                <p className="text-muted">Digite sua senha para continuar</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="login-password">Senha</label>
                <PasswordInput
                  id="login-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoFocus
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="login-error" role="alert">
                  <p>{error}</p>
                  {/* Orientação genérica: vale para qualquer recusa e não revela nada sobre a conta. */}
                  {isPlayerIdentity && <p className="login-error-help">Esqueceu a senha? Peça ao administrador para redefinir seu acesso. Depois é só escolher sua carta e criar uma nova.</p>}
                </div>
              )}

              <Button type="submit" isLoading={isSubmitting} className="login-submit">
                Entrar
              </Button>
            </form>

            {isPlayerIdentity && (
              <button type="button" className="login-switch-user" onClick={backToDeck}>
                Não é você? Escolher outra carta
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

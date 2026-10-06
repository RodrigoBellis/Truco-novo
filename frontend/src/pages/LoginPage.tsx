import { useState, type FormEvent } from "react";
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
// O PNG original (1536px, 2 MB) segue no repositório como fonte, mas não é
// mais importado: o que vai para o bundle são estas duas versões em 1120px —
// o dobro dos 560px em que a imagem é exibida, o suficiente para tela 2x.
import heroImageAvif from "../assets/truco-5-edicao.avif";
import heroImageWebp from "../assets/truco-5-edicao.webp";
import lightHeroImage from "../assets/truco-5-edicao.png";
import "./LoginPage.css";

const ADMIN_IDENTITY: Identity = { name: "Administrador", credential: { email: "admin@trucodonovo.com" } };

type Step = "role" | "players" | "password";

interface Identity {
  name: string;
  /** Como o backend identifica quem está entrando: e-mail (admin) ou playerId (jogador). */
  credential: LoginIdentifier;
}

export function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("role");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerQuery, setPlayerQuery] = useState("");

  const { data: players, isLoading: playersLoading } = useFetchData<RosterPlayer[]>(getRoster, [step === "players"]);

  if (!isLoading && user) {
    return <Navigate to={user.mustChangePassword ? "/criar-senha" : entryPathForUser(user)} replace />;
  }

  function chooseAdmin() {
    setIdentity(ADMIN_IDENTITY);
    setStep("password");
  }

  function choosePlayer(player: RosterPlayer) {
    setIdentity({ name: player.name, credential: { playerId: player.id } });
    setStep("password");
  }

  function goBack() {
    setError(null);
    setPassword("");
    if (step === "password") {
      const isAdmin = identity !== null && "email" in identity.credential;
      setStep(isAdmin ? "role" : "players");
    } else {
      setPlayerQuery("");
      setStep("role");
    }
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

  return (
    <div className="login-page page-enter">
      <div className="login-theme-toggle"><ThemeToggle /></div>
      <div className="login-decor" aria-hidden="true">
        <span>♠</span>
        <span>♣</span>
        <span>♦</span>
        <span>♥</span>
      </div>

      <div className={`login-content${step === "role" ? " login-content-hero" : ""}`}>
        {step !== "role" && (
          <div className="login-brand">
            <Logo size={40} />
            <span className="login-season">5ª Edição · 2026</span>
          </div>
        )}

        {step === "role" && (
          <div className="login-step login-step-hero">
            <div className="login-hero-wrap">
              {/* AVIF primeiro, WebP para quem não o suporta. O navegador
                  escolhe uma só — nunca baixa as duas. */}
              {theme === "light" ? (
                <img src={lightHeroImage} alt="Truco do Novo — 5ª Edição" className="login-hero-image" width={1536} height={1024} fetchPriority="high" />
              ) : (
                <picture>
                  <source srcSet={heroImageAvif} type="image/avif" />
                  <img src={heroImageWebp} alt="Truco do Novo — 5ª Edição" className="login-hero-image" width={1120} height={747} fetchPriority="high" />
                </picture>
              )}
              <span className="login-edition-badge">5ª Edição</span>
            </div>

            <p className="text-muted login-hero-subtitle">Escolha seu perfil para acessar o campeonato</p>

            <div className="role-grid">
              <button type="button" className="role-card" onClick={chooseAdmin}>
                <span className="role-card-icon">
                  <Icon name="settings" size={28} />
                </span>
                <strong>Área Administrativa</strong>
                <span className="text-faint">Gestão do campeonato</span>
              </button>

              <button type="button" className="role-card" onClick={() => setStep("players")}>
                <span className="role-card-icon">
                  <Icon name="team" size={28} />
                </span>
                <strong>Entrar como Jogador</strong>
                <span className="text-faint">Acompanhe sua dupla</span>
              </button>
            </div>
          </div>
        )}

        {step === "players" && (
          <div className="login-step">
            <button type="button" className="login-back" onClick={goBack}>
              ← Voltar
            </button>
            <h1>Selecione seu perfil</h1>
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

        {step === "password" && identity && (
          <div className="login-step login-step-password">
            <button type="button" className="login-back" onClick={goBack}>
              ← Voltar
            </button>

            <div className="password-identity">
              <span className="profile-avatar profile-avatar-lg">{identity.name.slice(0, 1).toUpperCase()}</span>
              <h1>{identity.name}</h1>
              <p className="text-muted">Digite sua senha para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <label className="login-field">
                <span>Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••"
                  required
                  autoFocus
                  autoComplete="current-password"
                />
              </label>

              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" isLoading={isSubmitting} className="login-submit">
                Entrar
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

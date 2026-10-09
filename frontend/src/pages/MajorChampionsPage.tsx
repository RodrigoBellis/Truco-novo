import { Link } from "react-router-dom";
import type { MajorChampionEntry } from "@truco/shared";
import { EmptyState } from "../components/ui/EmptyState";
import { Icon } from "../components/ui/Icon";
import { Loading } from "../components/ui/Loading";
import { SuitMark } from "../components/opening/SuitMark";
import { EditionPlaques } from "../components/truco/EditionPlaques";
import { MajorChampionsPodium } from "../components/truco/MajorChampionsPodium";
import { isOnPodium } from "../components/truco/podiumEntries";
import { useAuth } from "../hooks/useAuth";
import { useFetchData } from "../hooks/useFetchData";
import { getMajorChampions } from "../services/historyService";
import { getTeams } from "../services/teamsService";
import { getPlayers } from "../services/playersService";
import "./MajorChampionsPage.css";

function sameDuo(entry: MajorChampionEntry, names: string[]): boolean {
  return names.length === 2 && [...entry.players].sort().join("|") === [...names].sort().join("|");
}

/** Cabeçalho compacto: faixa baixa, sem card e sem números. */
function MajorHero() {
  return (
    <header className="major-hero">
      <span className="major-hero-beam" aria-hidden="true" />
      <p className="major-hero-eyebrow">
        <SuitMark suit="spade" className="major-hero-eyebrow-mark" />
        <span>Ranking histórico</span>
        <i aria-hidden="true">·</i>
        <span>Truco do Novo</span>
      </p>
      <h1>Maiores Campeões</h1>
      <p className="major-hero-message">A galeria de quem já levantou o caneco.</p>
      <Link to="/hall-da-fama" className="major-hero-link">Ver o histórico por edição <Icon name="arrow" size={16} /></Link>
    </header>
  );
}

/** Campeã fora do pódio: fileira discreta, com as mesmas plaquinhas de edição. */
function AlsoChampionRow({ entry, isMine }: { entry: MajorChampionEntry; isMine: boolean }) {
  return (
    <li className={`major-also-row${isMine ? " major-also-row-mine" : ""}`}>
      <span className="major-also-rank" aria-label={`${entry.rank}º lugar`}>{entry.rank}º</span>
      <div className="major-also-duo">
        <strong>{entry.name}</strong>
        {isMine && <span className="major-also-mine">Sua dupla</span>}
      </div>
      <EditionPlaques editions={entry.editions} className="major-also-editions" />
      <div className="major-also-titles"><b>{entry.titles}</b><span>{entry.titles === 1 ? "título" : "títulos"}</span></div>
    </li>
  );
}

interface RankingData {
  ranking: MajorChampionEntry[];
  /** Nomes dos dois integrantes da dupla do jogador; vazio quando não foi possível descobrir. */
  myNames: string[];
}

export function MajorChampionsPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useFetchData<RankingData>(async () => {
    const ranking = await getMajorChampions();
    // A dupla do jogador só rende o selo "Sua dupla": se falhar, o ranking segue normal.
    const [teamsResult, playersResult] = await Promise.allSettled([getTeams(), getPlayers()]);
    const teams = teamsResult.status === "fulfilled" ? teamsResult.value : [];
    const players = playersResult.status === "fulfilled" ? playersResult.value : [];
    const myTeam = teams.find((team) => team.id === user?.teamId);
    const myNames = myTeam ? [myTeam.player1Id, myTeam.player2Id].map((id) => players.find((player) => player.id === id)?.name).filter((name): name is string => Boolean(name)) : [];
    return { ranking, myNames };
  }, [user?.teamId]);
  if (isLoading) return <Loading fullHeight label="Carregando maiores campeões..." />;
  if (error) return <EmptyState icon={<Icon name="trophy" size={36} />} tone="danger" title="Não foi possível carregar o ranking" description="Tente novamente mais tarde ou avise o administrador." />;

  // A página é uma galeria de troféus: só entra quem tem título. O ranking completo continua
  // vindo da API; aqui só se filtra o que é exibido. As posições são as de `entry.rank`.
  const champions = (data?.ranking ?? []).filter((entry) => entry.titles > 0);
  if (champions.length === 0) {
    return (
      <div className="page-enter major-champions-page">
        <MajorHero />
        <EmptyState icon={<Icon name="trophy" size={36} />} title="O ranking está começando" description="Os campeões aparecerão aqui conforme o histórico das edições for registrado." />
      </div>
    );
  }

  const onPodium = champions.some(isOnPodium);
  // Campeãs abaixo do 3º lugar: não sobem ao pódio, mas não somem da página.
  const beyond = champions.filter((entry) => !isOnPodium(entry));
  const mineKey = champions.find((entry) => sameDuo(entry, data?.myNames ?? []))?.key;

  return (
    <div className="page-enter major-champions-page">
      <MajorHero />

      {onPodium && (
        <section className="major-gallery" aria-labelledby="major-gallery-title">
          <div className="major-stage" aria-hidden="true">
            <span className="major-stage-light" />
            <span className="major-stage-vignette" />
          </div>
          <h2 id="major-gallery-title" className="visually-hidden">Pódio dos campeões</h2>
          <MajorChampionsPodium entries={champions} mineKey={mineKey} />
        </section>
      )}

      {beyond.length > 0 && (
        <section className="major-also" aria-labelledby="major-also-title">
          <h2 id="major-also-title">Também levantaram o caneco</h2>
          <ol className="major-also-list">
            {beyond.map((entry) => <AlsoChampionRow key={entry.key} entry={entry} isMine={entry.key === mineKey} />)}
          </ol>
        </section>
      )}
    </div>
  );
}

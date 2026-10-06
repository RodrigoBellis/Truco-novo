import { Link } from "react-router-dom";
import type { MajorChampionEntry, Team } from "@truco/shared";
import { EmptyState } from "../components/ui/EmptyState";
import { Icon } from "../components/ui/Icon";
import { Loading } from "../components/ui/Loading";
import { PageHeader } from "../components/ui/PageHeader";
import { MajorChampionsPodium } from "../components/truco/MajorChampionsPodium";
import { TeamCrest } from "../components/truco/TeamCrest";
import { useAuth } from "../hooks/useAuth";
import { useFetchData } from "../hooks/useFetchData";
import { getMajorChampions } from "../services/historyService";
import { getTeams } from "../services/teamsService";
import { getPlayers } from "../services/playersService";
import { teamHue, teamTintStyle } from "../utils/teamColor";
import "./MajorChampionsPage.css";

/** Acima disso o mapa de casas não cabe numa linha; a lista de edições assume. */
const MAX_TRACK_EDITIONS = 12;

function sameDuo(entry: MajorChampionEntry, names: string[]): boolean {
  return names.length === 2 && [...entry.players].sort().join("|") === [...names].sort().join("|");
}

function raceMessage(titles: number, gap: number, topTitles: number): string {
  if (topTitles === 0) return "Ninguém tem título registrado ainda. O primeiro pode ser de vocês.";
  if (gap === 0) return "Vocês estão no topo do ranking. Agora é defender o lugar.";
  if (titles === 0) return `Ainda sem título. ${gap === 1 ? "Falta 1 conquista" : `Faltam ${gap} conquistas`} para alcançar o topo, e a primeira pode sair nesta edição.`;
  return `${gap === 1 ? "Falta 1 título" : `Faltam ${gap} títulos`} para alcançar o topo do ranking.`;
}

/** Mapa de títulos: uma casa por edição, acesa nas que a dupla venceu. */
function EditionTrack({ won, lastEdition }: { won: number[]; lastEdition: number }) {
  if (lastEdition === 0) return null;
  if (lastEdition > MAX_TRACK_EDITIONS) return won.length > 0 ? <span className="major-row-editions">{won.map((edition) => `${edition}ª edição`).join(" · ")}</span> : null;
  const label = won.length > 0 ? `Campeões na ${won.map((edition) => `${edition}ª`).join(", ")} edição` : "Sem títulos registrados";
  return (
    <ol className="major-track" aria-label={label}>
      {Array.from({ length: lastEdition }, (_, index) => index + 1).map((edition) => (
        <li key={edition} className={won.includes(edition) ? "major-track-won" : undefined} aria-hidden="true">{edition}</li>
      ))}
    </ol>
  );
}

function rowCaption(entry: MajorChampionEntry, isMine: boolean): string {
  if (isMine) return "Sua dupla";
  if (entry.titles === 0) return "Em busca do primeiro título";
  return entry.rank === 1 ? "No topo do ranking" : "Já levantou o caneco";
}

function MajorChampionRow({ entry, lastEdition, isMine }: { entry: MajorChampionEntry; lastEdition: number; isMine: boolean }) {
  return (
    <li className={`major-row${entry.rank === 1 && entry.titles > 0 ? " major-row-first" : ""}${isMine ? " major-row-mine" : ""}`}>
      <span className="major-row-rank" aria-label={`${entry.rank}º lugar`}>{entry.rank}º</span>
      <div className="major-row-duo">
        <strong>{entry.name}</strong>
        <span>{rowCaption(entry, isMine)}</span>
      </div>
      <EditionTrack won={entry.editions} lastEdition={lastEdition} />
      <div className="major-row-titles"><b>{entry.titles}</b><span>{entry.titles === 1 ? "título" : "títulos"}</span></div>
    </li>
  );
}

interface RankingData {
  ranking: MajorChampionEntry[];
  teams: Team[];
  myTeam?: Team;
  myNames: string[];
}

export function MajorChampionsPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useFetchData<RankingData>(async () => {
    const ranking = await getMajorChampions();
    // A dupla do jogador só personaliza a página: se falhar, o ranking segue normal.
    const [teamsResult, playersResult] = await Promise.allSettled([getTeams(), getPlayers()]);
    const teams = teamsResult.status === "fulfilled" ? teamsResult.value : [];
    const players = playersResult.status === "fulfilled" ? playersResult.value : [];
    const myTeam = teams.find((team) => team.id === user?.teamId);
    const myNames = myTeam ? [myTeam.player1Id, myTeam.player2Id].map((id) => players.find((player) => player.id === id)?.name).filter((name): name is string => Boolean(name)) : [];
    return { ranking, teams, myTeam, myNames };
  }, [user?.teamId]);
  if (isLoading) return <Loading fullHeight label="Carregando maiores campeões..." />;
  if (error) return <EmptyState icon={<Icon name="trophy" size={36} />} tone="danger" title="Não foi possível carregar o ranking" description="Tente novamente mais tarde ou avise o administrador." />;

  const duplas = data?.ranking ?? [];
  if (duplas.length === 0) {
    return (
      <div className="page-enter major-champions-page">
        <PageHeader title="Maiores Campeões" subtitle="Conquistas acumuladas por dupla" />
        <EmptyState icon={<Icon name="trophy" size={36} />} title="O ranking está começando" description="Os campeões aparecerão aqui conforme o histórico das edições for registrado." />
      </div>
    );
  }

  const leaders = duplas.filter((entry) => entry.titles > 0 && entry.rank <= 3);
  const titleCount = duplas.reduce((sum, entry) => sum + entry.titles, 0);
  const lastEdition = Math.max(0, ...duplas.flatMap((entry) => entry.editions));
  const topTitles = Math.max(...duplas.map((entry) => entry.titles));
  const myTeam = data?.myTeam;
  const mine = myTeam ? duplas.find((entry) => sameDuo(entry, data.myNames)) : undefined;
  const myHue = teamHue(myTeam?.id, data?.teams);
  const showsTrack = lastEdition > 0 && lastEdition <= MAX_TRACK_EDITIONS;

  return (
    <div className="page-enter major-champions-page">
      <header className="major-hero">
        <div className="major-hero-copy">
          <h1>Maiores Campeões</h1>
          <p>O ranking de quem mais vezes levantou o caneco do Truco do Novo. Cada título fica na conta da dupla para sempre.</p>
          <Link to="/hall-da-fama" className="major-hero-link">Ver o histórico por edição <Icon name="arrow" size={16} /></Link>
        </div>
        <dl className="major-hero-stats">
          <div><dd>{titleCount}</dd><dt>{titleCount === 1 ? "título registrado" : "títulos registrados"}</dt></div>
          <div><dd>{duplas.filter((entry) => entry.titles > 0).length}</dd><dt>duplas campeãs</dt></div>
          <div><dd>{duplas.length}</dd><dt>duplas no ranking</dt></div>
        </dl>
      </header>

      {mine && myTeam && (
        <section className="major-mine team-tint" style={teamTintStyle(myHue)} aria-labelledby="major-mine-title">
          <TeamCrest name={myTeam.name} hue={myHue} size="lg" />
          <div className="major-mine-copy">
            <h2 id="major-mine-title">{myTeam.name} na corrida</h2>
            <p>{raceMessage(mine.titles, topTitles - mine.titles, topTitles)}</p>
          </div>
          <dl className="major-mine-stats">
            <div><dd>{mine.rank}º</dd><dt>no ranking</dt></div>
            <div><dd>{mine.titles}</dd><dt>{mine.titles === 1 ? "título" : "títulos"}</dt></div>
          </dl>
          <Link to="/jogos" className="major-mine-link">Ver meus jogos <Icon name="arrow" size={18} /></Link>
        </section>
      )}

      {leaders.length > 0 && (
        <section className="major-leaders" aria-labelledby="major-leaders-title">
          <div className="major-section-heading">
            <h2 id="major-leaders-title">Pódio dos campeões</h2>
            <p>Empates compartilham a posição e o mesmo destaque.</p>
          </div>
          <MajorChampionsPodium entries={duplas} />
        </section>
      )}

      <section className="major-full-ranking" aria-labelledby="major-full-ranking-title">
        <div className="major-section-heading">
          <h2 id="major-full-ranking-title">Todas as duplas</h2>
          <p>A posição vem da quantidade de títulos; empates dividem o mesmo lugar.{showsTrack && " No mapa, cada casa é uma edição e as acesas são conquistas da dupla."}</p>
        </div>
        <ol className="major-ranking-list">
          {duplas.map((entry) => <MajorChampionRow key={entry.key} entry={entry} lastEdition={lastEdition} isMine={entry === mine} />)}
        </ol>
      </section>
    </div>
  );
}

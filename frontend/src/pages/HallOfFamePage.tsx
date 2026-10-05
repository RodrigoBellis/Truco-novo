import { Loading } from "../components/ui/Loading";
import { EmptyState } from "../components/ui/EmptyState";
import { TournamentHistory } from "../components/truco/TournamentHistory";
import { ChampionsRanking } from "../components/truco/ChampionsRanking";
import { useFetchData } from "../hooks/useFetchData";
import { getHallOfFame } from "../services/historyService";
import "./HallOfFamePage.css";

export function HallOfFamePage() {
  const { data, isLoading, error } = useFetchData(getHallOfFame);

  if (isLoading) return <Loading fullHeight label="Carregando o Hall da Fama..." />;
  if (error) return <EmptyState icon="⚠️" tone="danger" title="Não foi possível carregar o Hall da Fama" description={error} />;
  if (!data) return null;

  return (
    <div className="hof page-enter">
      <header className="hof-hero">
        <span className="hof-hero-badge">
          <span aria-hidden="true">♠</span> Salão dos Campeões
        </span>
        <h1 className="hof-hero-title">Hall da Fama</h1>
        <p className="hof-hero-subtitle">
          A história e os maiores campeões do Truco do Novo, edição por edição.
        </p>
        <div className="hof-hero-rule" aria-hidden="true" />
      </header>

      {data.editions.length === 0 ? (
        <EmptyState icon="🏆" title="Nenhuma edição registrada" description="O Hall da Fama será preenchido ao fim da primeira edição." />
      ) : (
        <>
          <TournamentHistory editions={data.editions} />
          <ChampionsRanking editions={data.editions} />
        </>
      )}
    </div>
  );
}

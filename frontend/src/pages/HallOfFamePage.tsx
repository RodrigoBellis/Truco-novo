import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loading } from "../components/ui/Loading";
import { EmptyState } from "../components/ui/EmptyState";
import { Icon } from "../components/ui/Icon";
import { ChampionTrophy } from "../components/truco/ChampionTrophy";
import { TournamentHistory } from "../components/truco/TournamentHistory";
import { duoLabel, editionSuit } from "../utils/hallOfFame";
import { useAuth } from "../hooks/useAuth";
import { useFetchData } from "../hooks/useFetchData";
import { getHallOfFame } from "../services/historyService";
import "./HallOfFamePage.css";

export function HallOfFamePage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useFetchData(getHallOfFame);
  // A edição escolhida vive aqui porque o cabeçalho e o histórico mostram a mesma.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const editions = useMemo(() => [...(data?.editions ?? [])].sort((a, b) => b.edition - a.edition), [data]);

  if (isLoading) return <Loading fullHeight label="Carregando o Hall da Fama..." />;
  if (error) return <EmptyState icon={<Icon name="trophy" size={36} />} tone="danger" title="Não foi possível carregar o Hall da Fama" description={error} />;
  if (!data) return null;

  const active = editions.find((entry) => entry.id === selectedId) ?? editions[0];
  const canSeeRanking = user?.role === "jogador";

  return (
    <div className="hof page-enter">
      <header className="hof-hero">
        <div className="hof-hero-copy">
          <h1 className="hof-hero-title">Hall da Fama</h1>
          <p className="hof-hero-subtitle">
            Cada edição do Truco do Novo gravou dois nomes no caneco. Aqui o legado fica guardado, edição por edição.
          </p>
          <div className="hof-hero-meta">
            {editions.length > 0 && <span className="hof-hero-count"><strong>{editions.length}</strong>{editions.length === 1 ? "edição registrada" : "edições registradas"}</span>}
            {canSeeRanking && <Link to="/maiores-campeoes" className="hof-ranking-link">Ranking de maiores campeões <Icon name="arrow" size={16} /></Link>}
          </div>
        </div>
        {active && (
          <div key={active.id} className="hof-hero-champion" aria-label={`Campeões da ${active.edition}ª Edição`}>
            <ChampionTrophy size={76} suit={editionSuit(active.edition)} />
            <div>
              <strong>{duoLabel(active.champions)}</strong>
              <span>Campeões da {active.edition}ª Edição · {active.year}</span>
            </div>
          </div>
        )}
      </header>

      {editions.length === 0 ? (
        <EmptyState icon={<Icon name="trophy" size={36} />} title="Nenhuma edição registrada" description="As edições aparecerão aqui quando seu histórico for registrado." />
      ) : (
        <TournamentHistory editions={editions} active={active} onSelect={setSelectedId} rankingHref={canSeeRanking ? "/maiores-campeoes" : undefined} />
      )}
    </div>
  );
}

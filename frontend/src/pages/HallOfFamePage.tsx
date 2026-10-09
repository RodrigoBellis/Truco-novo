import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loading } from "../components/ui/Loading";
import { EmptyState } from "../components/ui/EmptyState";
import { Icon } from "../components/ui/Icon";
import { SuitMark } from "../components/opening/SuitMark";
import { TournamentHistory } from "../components/truco/TournamentHistory";
import { buildEditionChapters } from "../utils/hallOfFame";
import { useAuth } from "../hooks/useAuth";
import { useFetchData } from "../hooks/useFetchData";
import { getHallOfFame } from "../services/historyService";
import "./HallOfFamePage.css";

export function HallOfFamePage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useFetchData(getHallOfFame);
  // A edição com o detalhe aberto; sem escolha, vale a mais recente encerrada.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const chapters = useMemo(() => buildEditionChapters(data?.editions ?? [], data?.currentEdition), [data]);

  if (isLoading) return <Loading fullHeight label="Carregando o Hall da Fama..." />;
  if (error) return <EmptyState icon={<Icon name="trophy" size={36} />} tone="danger" title="Não foi possível carregar o Hall da Fama" description={error} />;
  if (!data) return null;

  const closed = chapters.flatMap((chapter) => (chapter.kind === "closed" ? [chapter.entry] : []));
  const active = closed.find((entry) => entry.id === selectedId) ?? closed.at(-1) ?? null;
  const canSeeRanking = user?.role === "jogador";

  const intro = (
    <header className="hof-intro">
      <p className="hof-intro-eyebrow"><SuitMark suit="spade" className="hof-intro-mark" />A história <i>·</i> Truco do Novo</p>
      <h1 className="hof-intro-title">Hall da Fama</h1>
      <p className="hof-intro-message">Cada edição é um capítulo, e cada capítulo gravou dois nomes no caneco.</p>
      <div className="hof-intro-meta">
        {closed.length > 0 && <p className="hof-intro-count"><strong>{closed.length}</strong>{closed.length === 1 ? "edição encerrada" : "edições encerradas"}</p>}
        {canSeeRanking && <Link to="/maiores-campeoes" className="hof-ranking-link">Ranking de maiores campeões <Icon name="arrow" size={16} /></Link>}
      </div>
      <p className="hof-intro-hint" aria-hidden="true">Role para percorrer a história <Icon name="arrow" size={15} /></p>
    </header>
  );

  return (
    <div className="hof page-enter">
      <TournamentHistory intro={intro} chapters={chapters} active={active} onSelect={setSelectedId} />
      {closed.length === 0 && (
        <EmptyState icon={<Icon name="trophy" size={36} />} title="Nenhuma edição registrada" description="As edições aparecerão aqui quando seu histórico for registrado." />
      )}
    </div>
  );
}

import { Link, useNavigate } from "react-router-dom";
import { MajorChampionsPodium } from "../components/truco/MajorChampionsPodium";
import { Icon } from "../components/ui/Icon";
import { Button } from "../components/ui/Button";
import { useFetchData } from "../hooks/useFetchData";
import { useAuth } from "../hooks/useAuth";
import { getMajorChampions } from "../services/historyService";
import { markOpeningSeen } from "../utils/playerEntry";
import "./OpeningPage.css";

export function OpeningPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useFetchData(getMajorChampions);
  const continueToHome = () => { if (user) markOpeningSeen(user.id); navigate("/inicio", { replace: true }); };
  const hasChampions = data?.some(entry => entry.titles > 0);
  return <div className="opening-page page-enter">
    <section className="opening-hero">
      <div className="opening-copy"><h1>Bora fazer história e levar esse caneco para casa?</h1><p>Truco do Novo · 5ª Edição</p><p className="opening-message">Junte sua dupla, prepare o grito e entre na disputa. A próxima conquista começa na mesa.</p><Button onClick={continueToHome}>Entrar na edição atual <Icon name="arrow" size={18} /></Button><Link className="opening-history-link" to="/hall-da-fama">Conhecer a história do campeonato</Link></div>
      <div className="opening-trophy" aria-hidden="true"><Icon name="trophy" size={154} /><span>O próximo capítulo pode ser seu.</span></div>
    </section>
    <section className="opening-champions" aria-labelledby="opening-champions-title"><div className="opening-section-heading"><div><h2 id="opening-champions-title">Quem já fez história</h2><p>As duplas com mais títulos registrados no campeonato.</p></div><Link to="/maiores-campeoes">Ver ranking <Icon name="arrow" size={16} /></Link></div>
      {isLoading ? <div className="opening-loading" role="status">Carregando as conquistas do campeonato…</div> : error ? <div className="opening-loading" role="status">Não foi possível carregar os campeões. <Button variant="secondary" size="sm" onClick={refetch}>Tentar novamente</Button></div> : hasChampions ? <MajorChampionsPodium entries={data ?? []} /> : <p className="opening-loading">Os campeões aparecerão aqui quando as conquistas forem registradas.</p>}
    </section>
  </div>;
}

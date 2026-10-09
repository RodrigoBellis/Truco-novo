import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MajorChampionsPodium } from "../components/truco/MajorChampionsPodium";
import { OpeningStage } from "../components/opening/OpeningStage";
import { SuitMark } from "../components/opening/SuitMark";
import { prefersReducedMotion } from "../components/login/deckMotion";
import { Icon } from "../components/ui/Icon";
import { Button } from "../components/ui/Button";
import { useFetchData } from "../hooks/useFetchData";
import { useAuth } from "../hooks/useAuth";
import { getMajorChampions } from "../services/historyService";
import { markOpeningSeen } from "../utils/playerEntry";
import "./OpeningPage.css";

/** Tempo da saída do hero antes de trocar de rota (bate com .is-leaving no CSS). */
const LEAVE_MS = 300;

export function OpeningPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useFetchData(getMajorChampions);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const continueToHome = () => {
    if (leaving) return;
    if (user) markOpeningSeen(user.id);
    const go = () => navigate("/inicio", { replace: true });
    if (prefersReducedMotion()) {
      go();
      return;
    }
    // O hero se recolhe e só então a campanha entra.
    setLeaving(true);
    leaveTimer.current = window.setTimeout(go, LEAVE_MS);
  };

  const hasChampions = data?.some(entry => entry.titles > 0);

  return (
    <div className={`opening-page page-enter${leaving ? " is-leaving" : ""}`}>
      <section className="opening-hero">
        <div className="opening-backdrop" aria-hidden="true">
          <span className="opening-beam" />
          <span className="opening-warmth" />
        </div>

        <div className="opening-copy">
          <p className="opening-eyebrow">
            <SuitMark suit="spade" className="opening-eyebrow-mark" />
            <span>5ª Edição</span>
            <i aria-hidden="true">·</i>
            <span>Truco do Novo</span>
          </p>
          <h1 className="opening-title">
            <span className="opening-title-line"><span>Bora fazer história</span></span>{" "}
            <span className="opening-title-line"><span>e levar esse <em>caneco</em></span></span>{" "}
            <span className="opening-title-line"><span>para casa?</span></span>
          </h1>
          <p className="opening-message">Junte sua dupla, prepare o grito e entre na disputa.</p>
          <div className="opening-actions">
            <Button className="opening-cta" onClick={continueToHome}>Entrar na edição atual <Icon name="arrow" size={18} /></Button>
            <Link className="opening-history-link" to="/hall-da-fama">Conhecer a história do campeonato <Icon name="arrow" size={15} /></Link>
          </div>
        </div>

        <OpeningStage />
      </section>

      <section className="opening-champions" aria-labelledby="opening-champions-title">
        <div className="opening-seam" aria-hidden="true"><span><SuitMark suit="spade" size={16} /></span></div>
        <div className="opening-section-heading">
          <div>
            <h2 id="opening-champions-title">Quem já fez história</h2>
            <p>As duplas com mais títulos registrados no campeonato.</p>
          </div>
          <Link className="link-arrow" to="/maiores-campeoes">Ver ranking <Icon name="arrow" size={16} /></Link>
        </div>
        {isLoading ? (
          <div className="opening-loading" role="status">Carregando as conquistas do campeonato…</div>
        ) : error ? (
          <div className="opening-loading" role="status">Não foi possível carregar os campeões. <Button variant="secondary" size="sm" onClick={refetch}>Tentar novamente</Button></div>
        ) : hasChampions ? (
          <MajorChampionsPodium entries={data ?? []} compact />
        ) : (
          <p className="opening-loading">Os campeões aparecerão aqui quando as conquistas forem registradas.</p>
        )}
      </section>
    </div>
  );
}

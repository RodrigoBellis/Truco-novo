import type { HistoryEntry } from "@truco/shared";
import { useMemo } from "react";
import { buildChampionDuplas, buildHallOfFameStats } from "../../utils/hallOfFame";
import { EmptyState } from "../ui/EmptyState";
import { HallOfFameStats } from "./HallOfFameStats";
import { ChampionsPodium } from "./ChampionsPodium";
import { ChampionCard } from "./ChampionCard";
import "./ChampionCard.css";
import "./ChampionsRanking.css";

export function ChampionsRanking({ editions }: { editions: HistoryEntry[] }) {
  const duplas = useMemo(() => buildChampionDuplas(editions), [editions]);
  const stats = useMemo(() => buildHallOfFameStats(editions, duplas), [editions, duplas]);
  const champions = useMemo(() => duplas.filter((dupla) => dupla.titles > 0), [duplas]);

  if (champions.length === 0) {
    return (
      <section className="champions-ranking">
        <h2 className="hof-section-title">Ranking de Campeões</h2>
        <EmptyState icon="🏆" title="Nenhum campeão ainda" description="O ranking será atualizado após a primeira edição." />
      </section>
    );
  }

  const top3 = champions.slice(0, 3);
  const rest = champions.slice(3);

  return (
    <section className="champions-ranking">
      <h2 className="hof-section-title">Ranking de Campeões</h2>

      <HallOfFameStats stats={stats} />
      <ChampionsPodium top3={top3} />

      {rest.length > 0 && (
        <div className="champions-grid stagger">
          {rest.map((dupla, index) => (
            <ChampionCard key={dupla.key} dupla={dupla} rank={index + 4} />
          ))}
        </div>
      )}
    </section>
  );
}

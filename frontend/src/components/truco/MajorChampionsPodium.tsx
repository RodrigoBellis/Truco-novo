import type { MajorChampionEntry } from "@truco/shared";
import { Icon } from "../ui/Icon";
import { ChampionTrophy } from "./ChampionTrophy";
import "./MajorChampionsPodium.css";

/** As posições vêm do ranking central, inclusive em caso de empate. */
export function MajorChampionsPodium({ entries }: { entries: MajorChampionEntry[] }) {
  const leaders = entries.filter(entry => entry.titles > 0 && entry.rank <= 3);
  if (!leaders.length) return null;
  return <div className="champions-podium-real">{leaders.map(entry => <article key={entry.key} className={`champions-podium-place champions-podium-place-${entry.rank}`}>
    <div className="champions-podium-cup">{entry.rank === 1 ? <ChampionTrophy size={96} /> : <Icon name="trophy" size={30} />}</div>
    <div className="champions-podium-body">
      <span className="champions-podium-rank">{entry.rank}º lugar</span>
      <h3>{entry.name}</h3>
      <ul className="champions-podium-editions" aria-label="Edições conquistadas">{entry.editions.map(edition => <li key={edition}>{edition}ª edição</li>)}</ul>
    </div>
    <strong className="champions-podium-titles"><b>{entry.titles}</b> {entry.titles === 1 ? "título" : "títulos"}</strong>
  </article>)}</div>;
}

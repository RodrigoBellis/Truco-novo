import { useState } from "react";
import { groupDisplayName, type GroupId, type StandingRow, type Team } from "@truco/shared";
import { Button } from "../ui/Button";
import { teamLabel } from "../../utils/teamHelpers";
import "./TieDecision.css";

interface TieDecisionProps {
  groupId: GroupId;
  /** Duplas empatadas em todos os critérios da classificação, na ordem provisória da tabela. */
  cluster: StandingRow[];
  teams: Team[];
  isSaving: boolean;
  onConfirm: (orderedTeamIds: string[]) => void;
}

/**
 * Empate exato não tem critério automático: o administrador põe as duplas na ordem final
 * (setas para subir e descer) e confirma. As posições disputadas são as do próprio empate.
 */
export function TieDecision({ groupId, cluster, teams, isSaving, onConfirm }: TieDecisionProps) {
  const positions = cluster.map((row) => row.position).sort((a, b) => a - b);
  const [order, setOrder] = useState(() => cluster.map((row) => row.teamId));
  const sample = cluster[0];

  function move(index: number, delta: number) {
    setOrder((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <section className="tie-decision" aria-label={`Decidir empate do ${groupDisplayName(groupId)}`}>
      <h3>Empate a decidir no {groupDisplayName(groupId)}</h3>
      <p>
        Estas duplas terminaram iguais em tudo: {sample.pontos} pontos, {sample.vitorias} {sample.vitorias === 1 ? "vitória" : "vitórias"}, {sample.vitorias2x0} por 2x0,
        confronto direto empatado e o mesmo saldo de quedas. Não há outro critério de desempate. Ponha na ordem final e confirme; o mata-mata só pode ser gerado depois disso.
      </p>
      <ol className="tie-decision-list">
        {order.map((teamId, index) => {
          const name = teamLabel(teams, teamId);
          return (
            <li key={teamId}>
              <span className="tie-decision-position">{positions[index]}º</span>
              <strong>{name}</strong>
              <span className="tie-decision-moves">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || isSaving} aria-label={`Subir ${name}`}>↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1 || isSaving} aria-label={`Descer ${name}`}>↓</button>
              </span>
            </li>
          );
        })}
      </ol>
      <Button isLoading={isSaving} onClick={() => onConfirm(order)}>Confirmar posições do {groupDisplayName(groupId)}</Button>
    </section>
  );
}

import type { OpponentInsight } from "../../utils/opponentInsight";
import "./NextOpponentCard.css";

interface NextOpponentCardProps {
  opponentName: string;
  insight: OpponentInsight;
}

/** Destaque do próximo confronto: quem vem pela frente, onde está na tabela e o porquê do jogo importar. */
export function NextOpponentCard({ opponentName, insight }: NextOpponentCardProps) {
  return (
    <section className={`next-opponent next-opponent-${insight.tone}`} aria-label="Próximo adversário">
      <span className="next-opponent-suits" aria-hidden="true">
        ♠ ♥ ♦ ♣
      </span>

      <p className="next-opponent-label">Próximo adversário</p>
      <h2 className="next-opponent-name">{opponentName}</h2>

      {insight.positionLabel && (
        <p className="next-opponent-position">
          <span className="next-opponent-medal" aria-hidden="true">
            {insight.medal}
          </span>
          {insight.positionLabel}
        </p>
      )}

      <p className="next-opponent-message">{insight.message}</p>
    </section>
  );
}

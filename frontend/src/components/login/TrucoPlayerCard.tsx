import type { CSSProperties } from "react";
import type { PlayerCardIdentity } from "./playerCardIdentity";
import "./TrucoPlayerCard.css";

interface TrucoPlayerCardProps {
  name: string;
  identity: PlayerCardIdentity;
  className?: string;
}

/**
 * Carta de truco de um jogador. Só apresentação: quem decide posição, luz e
 * movimento é o palco (PlayerCardDeck), via `--shade`, `--glare` e transform.
 */
export function TrucoPlayerCard({ name, identity, className }: TrucoPlayerCardProps) {
  const corner = (
    <>
      <b>{identity.rank}</b>
      <i>{identity.suit}</i>
    </>
  );

  return (
    <div
      className={`truco-card${identity.isRed ? " truco-card-red" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--card-hue": identity.hue } as CSSProperties}
    >
      <div className="truco-card-face">
        <span className="truco-card-pattern" aria-hidden="true" />
        <span className="truco-card-watermark" aria-hidden="true">{identity.suit}</span>
        <span className="truco-card-corner truco-card-corner-top" aria-hidden="true">{corner}</span>
        <span className="truco-card-corner truco-card-corner-bottom" aria-hidden="true">{corner}</span>
        <span className="truco-card-edition">Truco do Novo · 5ª</span>
        {identity.manilha && <span className="truco-card-manilha">{identity.manilha}</span>}
        <span className="truco-card-monogram" aria-hidden="true">
          <span>{identity.initials}</span>
          <i>{identity.suit}</i>
        </span>
        <strong className="truco-card-name">{name}</strong>
      </div>
      <span className="truco-card-glare" aria-hidden="true" />
      <span className="truco-card-shade" aria-hidden="true" />
    </div>
  );
}

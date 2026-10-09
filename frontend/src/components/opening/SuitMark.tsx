export type Suit = "spade" | "heart" | "club" | "diamond";

interface SuitMarkProps {
  suit: Suit;
  size?: number;
  className?: string;
}

const PATHS: Record<Exclude<Suit, "club">, string> = {
  spade: "M12 2C9 7 3 10 3 15a4.5 4.5 0 0 0 8 2.8c0 2.2-1 3.7-2.5 4.2h7C14 21.5 13 20 13 17.8A4.5 4.5 0 0 0 21 15c0-5-6-8-9-13Z",
  heart: "M12 21C5 15 2 11.5 2 7.5A5 5 0 0 1 12 6a5 5 0 0 1 10 1.5c0 4-3 7.5-10 13.5Z",
  diamond: "M12 2l8 10-8 10-8-10Z",
};

/** Naipe desenhado em SVG (herda a cor do texto), para não depender do glifo da fonte. */
export function SuitMark({ suit, size, className }: SuitMarkProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {suit === "club" ? (
        <>
          <circle cx="12" cy="7.2" r="4.3" />
          <circle cx="6.9" cy="13.6" r="4.3" />
          <circle cx="17.1" cy="13.6" r="4.3" />
          <path d="M12 10.5c0 7-1 9.8-3 11.5h6c-2-1.7-3-4.5-3-11.5Z" />
        </>
      ) : (
        <path d={PATHS[suit]} />
      )}
    </svg>
  );
}

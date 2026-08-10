interface ChampionTrophyProps {
  size?: number;
  /** Edição ainda em disputa — desenha "?" no lugar do naipe. */
  pending?: boolean;
  /** Naipe gravado na taça, para diferenciar as edições. */
  suit?: "♣" | "♥" | "♠" | "♦";
}

export function ChampionTrophy({ size = 92, pending = false, suit = "♠" }: ChampionTrophyProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="champion-trophy"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="trophy-gold" x1="30" y1="12" x2="72" y2="78" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-accent-300)" />
          <stop offset="0.5" stopColor="var(--color-accent-500)" />
          <stop offset="1" stopColor="var(--color-accent-700)" />
        </linearGradient>
      </defs>

      {/* Alças */}
      <path
        d="M32 24H22c0 12 4 19 12 21M68 24h10c0 12-4 19-12 21"
        stroke="url(#trophy-gold)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Taça */}
      <path d="M32 18h36v20c0 11-8 19-18 19s-18-8-18-19V18Z" fill="url(#trophy-gold)" />
      {/* Haste e base */}
      <rect x="46" y="57" width="8" height="14" rx="2" fill="url(#trophy-gold)" />
      <rect x="34" y="71" width="32" height="7" rx="2.5" fill="url(#trophy-gold)" />
      <rect x="29" y="78" width="42" height="7" rx="2.5" fill="url(#trophy-gold)" />

      {/* Naipe gravado */}
      <text
        x="50"
        y="42"
        textAnchor="middle"
        fontSize="20"
        fontWeight="800"
        fill="var(--color-bg)"
        opacity="0.85"
      >
        {pending ? "?" : suit}
      </text>

      {/* Brilho que varre a taça */}
      <rect className="champion-trophy-shine" x="26" y="10" width="14" height="80" fill="#fff" opacity="0.28" />
    </svg>
  );
}

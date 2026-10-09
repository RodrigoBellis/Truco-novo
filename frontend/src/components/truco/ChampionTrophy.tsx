import { useId } from "react";

interface ChampionTrophyProps {
  size?: number;
  /** Edição ainda em disputa — desenha "?" no lugar do naipe. */
  pending?: boolean;
  /** Naipe gravado na taça, para diferenciar as edições. */
  suit?: "♣" | "♥" | "♠" | "♦";
}

export function ChampionTrophy({ size = 92, pending = false, suit = "♠" }: ChampionTrophyProps) {
  // Id próprio por instância: com dois troféus na página, um id repetido faria todos usarem
  // o gradiente do primeiro — e o troféu de prata sairia dourado.
  const gradientId = `trophy-metal-${useId().replace(/:/g, "")}`;
  const gold = `url(#${gradientId})`;
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
        <linearGradient id={gradientId} x1="30" y1="12" x2="72" y2="78" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-accent-300)" />
          <stop offset="0.5" stopColor="var(--color-accent-500)" />
          <stop offset="1" stopColor="var(--color-accent-700)" />
        </linearGradient>
      </defs>

      {/* Alças */}
      <path
        d="M32 24H22c0 12 4 19 12 21M68 24h10c0 12-4 19-12 21"
        stroke={gold}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Taça */}
      <path d="M32 18h36v20c0 11-8 19-18 19s-18-8-18-19V18Z" fill={gold} />
      {/* Haste e base */}
      <rect x="46" y="57" width="8" height="14" rx="2" fill={gold} />
      <rect x="34" y="71" width="32" height="7" rx="2.5" fill={gold} />
      <rect x="29" y="78" width="42" height="7" rx="2.5" fill={gold} />

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

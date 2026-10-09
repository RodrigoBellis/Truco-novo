import { useId } from "react";
import "./OpeningTrophy.css";

const SPADE = "M12 2C9 7 3 10 3 15a4.5 4.5 0 0 0 8 2.8c0 2.2-1 3.7-2.5 4.2h7C14 21.5 13 20 13 17.8A4.5 4.5 0 0 0 21 15c0-5-6-8-9-13Z";
const BOWL = "M68 70C68 150 104 214 160 222C216 214 252 150 252 70Z";
const HANDLE_LEFT = "M72 92C20 88 14 150 52 172C66 180 84 178 96 170";
const HANDLE_RIGHT = "M248 92C300 88 306 150 268 172C254 180 236 178 224 170";

export type TrophyMetal = "copper" | "gold" | "silver";

/** Tintas de um metal. A ordem das listas acompanha os `stop` de cada gradiente. */
interface MetalPalette {
  /** Corpo cilíndrico: luz principal à esquerda, núcleo de sombra à direita, luz rebatida na borda. */
  body: readonly string[];
  rim: readonly string[];
  inside: readonly string[];
  handleWarm: readonly string[];
  handleShade: readonly string[];
  /** Oclusão sob o aro e no fundo da taça. */
  occlusion: string;
  occlusionDeep: string;
  /** Sombra própria do metal (base da haste, aro, lábio). */
  shade: string;
  handleEdgeLeft: string;
  handleEdgeRight: string;
  horizon: string;
  /** Luzes: fio principal, fio secundário da alça, recorte, horizonte e mancha difusa. */
  light: string;
  lightHandle: string;
  lightRim: string;
  lightHorizon: string;
  lightSoft: string;
  /** Espadilha gravada: borda clara + corte escuro. */
  engraveLight: string;
  engraveCut: string;
  lipDark: string;
  lipLight: string;
  /** Pedestal. */
  base: readonly string[];
  baseTop: readonly string[];
  baseDark: string;
  plateText: string;
}

const METALS: Record<TrophyMetal, MetalPalette> = {
  /* Padrão: o caneco da abertura e do campeão do mata-mata. Não alterar estas tintas. */
  copper: {
    body: ["#5e2603", "#a34d08", "#ec9a30", "#ffe09c", "#fff8e4", "#ffcf78", "#f59a2a", "#d66e0f", "#974206", "#7a3305", "#cf7c2c", "#5a2402"],
    rim: ["#a04c08", "#ffd98f", "#fffbee", "#ffc46b", "#b85a0a", "#f0a94e", "#7a3404"],
    inside: ["#c9670f", "#7a3404", "#2a0e00"],
    handleWarm: ["#ffd08a", "#f09a30", "#a54a07"],
    handleShade: ["#e89238", "#c4630e", "#7a3404"],
    occlusion: "#3c1400",
    occlusionDeep: "#2c0e00",
    shade: "#5a2402",
    handleEdgeLeft: "#7a3404",
    handleEdgeRight: "#5e2603",
    horizon: "#5e2603",
    light: "#fffbee",
    lightHandle: "#ffe2b0",
    lightRim: "#ffe9c2",
    lightHorizon: "#fff3cf",
    lightSoft: "#fff2cf",
    engraveLight: "#fff0cc",
    engraveCut: "#7c3404",
    lipDark: "#2a0e00",
    lipLight: "#ffd98f",
    base: ["#060f20", "#1b4588", "#2c63b8", "#102c58", "#060f20", "#14315f", "#050d1c"],
    baseTop: ["#12305f", "#3d74cc", "#0c2247"],
    baseDark: "#02060e",
    plateText: "#ffc46b",
  },
  /* Ouro e prata: só no ranking histórico (Maiores Campeões e pódio da abertura). */
  gold: {
    body: ["#4a3102", "#8c5f05", "#dba820", "#ffe487", "#fffbe2", "#ffdc68", "#f4c531", "#cd9710", "#8a6005", "#6b4a04", "#c89a30", "#422c02"],
    rim: ["#8c5f05", "#ffe9a0", "#fffdf2", "#ffd964", "#a67808", "#ecc95c", "#6b4a04"],
    inside: ["#b98a10", "#6b4a04", "#221600"],
    handleWarm: ["#ffe9a0", "#e9b829", "#8a6005"],
    handleShade: ["#dbae3a", "#ad800b", "#6b4a04"],
    occlusion: "#2e1e00",
    occlusionDeep: "#221600",
    shade: "#422c02",
    handleEdgeLeft: "#6b4a04",
    handleEdgeRight: "#4a3102",
    horizon: "#4a3102",
    light: "#fffdf2",
    lightHandle: "#fff0bf",
    lightRim: "#fff3cc",
    lightHorizon: "#fff8d6",
    lightSoft: "#fff6d4",
    engraveLight: "#fff5cc",
    engraveCut: "#6b4a04",
    lipDark: "#221600",
    lipLight: "#ffe9a0",
    base: ["#070604", "#30281a", "#4b3f29", "#1c170e", "#070604", "#262014", "#050403"],
    baseTop: ["#262014", "#665637", "#15110a"],
    baseDark: "#030201",
    plateText: "#f4c531",
  },
  silver: {
    body: ["#2a303b", "#5b6676", "#a8b2c1", "#e7ebf1", "#ffffff", "#d6dce6", "#b5bdca", "#8c96a7", "#5b6676", "#454e5c", "#9aa4b5", "#252a34"],
    rim: ["#5b6676", "#e2e7ee", "#ffffff", "#cfd6e0", "#6e798b", "#b9c2cf", "#454e5c"],
    inside: ["#7b8698", "#454e5c", "#13171f"],
    handleWarm: ["#eef1f6", "#b5bdca", "#5b6676"],
    handleShade: ["#aab3c1", "#7b8698", "#454e5c"],
    occlusion: "#10141c",
    occlusionDeep: "#0a0d14",
    shade: "#252a34",
    handleEdgeLeft: "#454e5c",
    handleEdgeRight: "#2a303b",
    horizon: "#2a303b",
    light: "#ffffff",
    lightHandle: "#e6ebf3",
    lightRim: "#eef2f8",
    lightHorizon: "#f4f7fb",
    lightSoft: "#f0f4fa",
    engraveLight: "#ffffff",
    engraveCut: "#3b4452",
    lipDark: "#13171f",
    lipLight: "#e2e7ee",
    base: ["#06080c", "#262d3b", "#394355", "#151a24", "#06080c", "#1b212d", "#040609"],
    baseTop: ["#1b212d", "#525f77", "#0f131b"],
    baseDark: "#020306",
    plateText: "#d6dce6",
  },
};

const BODY_OFFSETS = [0, 0.07, 0.16, 0.24, 0.3, 0.37, 0.5, 0.64, 0.78, 0.87, 0.94, 1];
const RIM_OFFSETS = [0, 0.2, 0.32, 0.5, 0.8, 0.93, 1];
const INSIDE_OFFSETS = [0, 0.35, 1];
const HANDLE_WARM_OFFSETS = [0, 0.38, 1];
const HANDLE_SHADE_OFFSETS = [0, 0.4, 1];
const BASE_OFFSETS = [0, 0.2, 0.27, 0.4, 0.86, 0.95, 1];
const BASE_TOP_OFFSETS = [0, 0.36, 1];

function stops(colors: readonly string[], offsets: readonly number[]) {
  return colors.map((color, index) => <stop key={offsets[index]} offset={offsets[index]} stopColor={color} />);
}

interface OpeningTrophyProps {
  /** Metal da taça. O padrão é o caneco da edição (abertura e mata-mata). */
  metal?: TrophyMetal;
  /** Texto gravado no pedestal; `null` deixa a placa lisa. */
  plate?: string | null;
}

/**
 * Caneco do campeonato (abertura, card do campeão no mata-mata e pódio histórico): taça
 * metálica desenhada em SVG, sem imagem nem biblioteca 3D. O metal é modelado em camadas:
 * gradiente cilíndrico (luz principal à esquerda, núcleo de sombra à direita e luz rebatida
 * na borda), oclusão sob o aro e no fundo da taça, reflexo frio azul do ambiente, especular
 * nítido e luz de recorte. As cores são fixas de propósito: metal não muda com o tema.
 *
 * Nada aqui fica em laço. O especular acompanha `--px`/`--py` quando quem usa os define
 * (o palco da abertura); sem eles fica parado. Os ids são únicos por instância (`useId`):
 * o pódio mostra canecos de metais diferentes na mesma página.
 */
export function OpeningTrophy({ metal = "copper", plate = "5ª EDIÇÃO" }: OpeningTrophyProps = {}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `ot-${name}-${uid}`;
  const ref = (name: string) => `url(#${id(name)})`;
  const m = METALS[metal];

  return (
    <svg className="opening-trophy-svg" viewBox="0 0 320 400" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="0">{stops(m.body, BODY_OFFSETS)}</linearGradient>
        <linearGradient id={id("gold-rim")} x1="0" y1="0" x2="1" y2="0">{stops(m.rim, RIM_OFFSETS)}</linearGradient>
        {/* Oclusão vertical: sombra projetada pelo aro em cima, fundo da taça embaixo. */}
        <linearGradient id={id("depth")} x1="0" y1="70" x2="0" y2="222" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={m.occlusion} stopOpacity="0.42" />
          <stop offset="0.16" stopColor={m.occlusion} stopOpacity="0" />
          <stop offset="0.52" stopColor={m.occlusion} stopOpacity="0.04" />
          <stop offset="1" stopColor={m.occlusionDeep} stopOpacity="0.66" />
        </linearGradient>
        <radialGradient id={id("inside")} cx="0.68" cy="0.3" r="0.8">{stops(m.inside, INSIDE_OFFSETS)}</radialGradient>
        <linearGradient id={id("cold")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9cc0ff" stopOpacity="0" />
          <stop offset="0.7" stopColor="#9cc0ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#9cc0ff" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={id("handle-warm")} x1="0" y1="84" x2="0" y2="182" gradientUnits="userSpaceOnUse">{stops(m.handleWarm, HANDLE_WARM_OFFSETS)}</linearGradient>
        <linearGradient id={id("handle-shade")} x1="0" y1="84" x2="0" y2="182" gradientUnits="userSpaceOnUse">{stops(m.handleShade, HANDLE_SHADE_OFFSETS)}</linearGradient>
        <linearGradient id={id("shine")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.62" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("navy")} x1="0" y1="0" x2="1" y2="0">{stops(m.base, BASE_OFFSETS)}</linearGradient>
        <linearGradient id={id("navy-top")} x1="0" y1="0" x2="1" y2="0">{stops(m.baseTop, BASE_TOP_OFFSETS)}</linearGradient>
        <radialGradient id={id("floor")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#04080f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#04080f" stopOpacity="0" />
        </radialGradient>
        <filter id={id("soft")} x="-30%" y="-15%" width="160%" height="130%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <clipPath id={id("bowl-clip")}>
          <path d="M68 70C68 150 104 214 160 222C216 214 252 150 252 70A92 16 0 0 0 68 70Z" />
        </clipPath>
      </defs>

      <ellipse cx="160" cy="381" rx="122" ry="13" fill={ref("floor")} />

      {/* Pedestal: dois andares com filete de metal e a placa gravada. */}
      <path d="M78 344V366A82 12 0 0 0 242 366V344A82 12 0 0 1 78 344Z" fill={ref("navy")} />
      <path d="M78 366A82 12 0 0 0 242 366" stroke={m.baseDark} strokeOpacity="0.55" strokeWidth="2.5" />
      <ellipse cx="160" cy="344" rx="82" ry="12" fill={ref("navy-top")} />
      <ellipse cx="160" cy="344.5" rx="67" ry="10" fill={m.baseDark} opacity="0.5" />
      <path d="M78 357A82 12 0 0 0 242 357" stroke={ref("gold-rim")} strokeWidth="2.5" />
      <path d="M98 308V340A62 10 0 0 0 222 340V308A62 10 0 0 1 98 308Z" fill={ref("navy")} />
      {plate ? <text x="160" y="337" textAnchor="middle" fontSize="11.5" fontWeight="800" letterSpacing="2.4" fill={m.plateText}>{plate}</text> : null}
      <ellipse cx="160" cy="308" rx="62" ry="10" fill={ref("gold-rim")} />
      <ellipse cx="160" cy="306.5" rx="50" ry="7" fill={m.shade} opacity="0.42" />

      {/* Haste */}
      <path d="M148 270H172C174 290 186 300 196 306H124C134 300 146 290 148 270Z" fill={ref("gold")} />
      <path d="M148 270H172C172.6 277 174.6 283 178 288H142C145.4 283 147.4 277 148 270Z" fill={m.occlusion} opacity="0.34" />
      <path d="M140 216C146 240 150 250 150 262H170C170 250 174 240 180 216Z" fill={ref("gold")} />
      <path d="M140 216C142.4 225.6 144.4 233 146 239H174C175.6 233 177.6 225.6 180 216Z" fill={m.occlusionDeep} opacity="0.4" />
      <ellipse cx="160" cy="266" rx="27" ry="9" fill={ref("gold-rim")} />
      <path d="M133 266A27 9 0 0 0 187 266" stroke={m.shade} strokeOpacity="0.5" strokeWidth="2" />
      <path d="M137 263A27 9 0 0 1 172 258" stroke={m.light} strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" />

      {/* Alças: ficam atrás da taça; contorno escuro, corpo em gradiente e fio de luz por cima. */}
      <g strokeLinecap="round">
        <path d={HANDLE_LEFT} stroke={m.handleEdgeLeft} strokeWidth="14" />
        <path d={HANDLE_RIGHT} stroke={m.handleEdgeRight} strokeWidth="14" />
        <path d={HANDLE_LEFT} stroke={ref("handle-warm")} strokeWidth="9.5" />
        <path d={HANDLE_RIGHT} stroke={ref("handle-shade")} strokeWidth="9.5" />
        <path d="M66 90C26 90 20 142 50 164" stroke={m.light} strokeOpacity="0.9" strokeWidth="2.4" />
        <path d="M254 90C294 90 300 142 270 164" stroke="#9cc0ff" strokeOpacity="0.6" strokeWidth="2" />
        <path d="M276 100C296 118 294 148 272 166" stroke={m.lightHandle} strokeOpacity="0.5" strokeWidth="1.2" />
      </g>

      {/* Taça */}
      <path d={BOWL} fill={ref("gold")} />
      <path d={BOWL} fill={ref("depth")} />
      <g clipPath={ref("bowl-clip")}>
        {/* Reflexo frio do ambiente (azul do campeonato) no lado em sombra. */}
        <path d="M206 78C216 128 206 180 178 214C218 196 246 142 246 78Z" fill={ref("cold")} opacity="0.62" />
        {/* Luz de recorte: fio claro na silhueta direita, separando o metal do fundo. */}
        <path d="M252 74C252 150 216 212 164 221" stroke={m.lightRim} strokeOpacity="0.75" strokeWidth="3" />
        <path d="M68 74C68 150 104 212 156 221" stroke={m.occlusionDeep} strokeOpacity="0.35" strokeWidth="4" />
        {/* Horizonte refletido: a faixa que faz o metal parecer polido. */}
        <path d="M70 100A90 14 0 0 0 250 100" stroke={m.horizon} strokeOpacity="0.5" strokeWidth="1.5" />
        <path d="M70 102.5A90 14 0 0 0 250 102.5" stroke={m.lightHorizon} strokeOpacity="0.6" strokeWidth="1" />
        {/* Luz principal: mancha difusa + especular nítido. Acompanha o ponteiro no palco. */}
        <g className="opening-trophy-spec">
          <path d="M90 80C88 130 102 172 126 198C110 168 102 128 104 80Z" fill="#fff" opacity="0.72" filter={ref("soft")} />
          <path d="M96 108C97 134 104 158 116 178" stroke="#fff" strokeOpacity="0.92" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M198 110C198 134 192 156 182 174" stroke={m.lightSoft} strokeOpacity="0.3" strokeWidth="5" strokeLinecap="round" filter={ref("soft")} />
        </g>
        {/* Espadilha gravada: sombra clara deslocada + corte escuro por cima. */}
        <g transform="translate(128.8 116) scale(2.6)">
          <path transform="translate(0.35 0.45)" d={SPADE} fill={m.engraveLight} opacity="0.62" />
          <path d={SPADE} fill={m.engraveCut} opacity="0.78" />
        </g>
        {/* Varredura de luz: cruza a taça uma vez na entrada e de novo no hover. */}
        <g transform="skewX(-18)">
          <rect className="opening-trophy-shine" x="14" y="40" width="58" height="200" fill={ref("shine")} />
        </g>
      </g>

      {/* Boca da taça: aro, interior e os dois fios de luz do lábio. */}
      <ellipse cx="160" cy="70" rx="92" ry="16" fill={ref("gold-rim")} />
      <ellipse cx="160" cy="71" rx="84" ry="11.5" fill={ref("inside")} />
      <path d="M77 69.5A84 11.5 0 0 1 243 69.5" stroke={m.lipDark} strokeOpacity="0.55" strokeWidth="1.6" />
      <path d="M80 73A84 11.5 0 0 0 240 73" stroke={m.lipLight} strokeOpacity="0.6" strokeWidth="1.5" />
      <path d="M72 76A92 16 0 0 0 150 85.6" stroke={m.light} strokeOpacity="0.85" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M69 70A92 16 0 0 0 251 70" stroke={m.shade} strokeOpacity="0.3" strokeWidth="1" transform="translate(0 2.4)" />

      {/* Faíscas */}
      <path className="opening-trophy-spark" d="M112 96l2.6 7.4 7.4 2.6-7.4 2.6-2.6 7.4-2.6-7.4-7.4-2.6 7.4-2.6Z" fill="#fff" />
      <path className="opening-trophy-spark opening-trophy-spark-late" d="M226 58l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8Z" fill="#fff" />
    </svg>
  );
}

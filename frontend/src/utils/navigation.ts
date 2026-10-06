import type { NavItem } from "../types";

export const PLAYER_NAV_ITEMS: NavItem[] = [
  { to: "/inicio", label: "Início", icon: "home" },
  { to: "/hall-da-fama", label: "Hall da Fama", icon: "ranking" },
  { to: "/maiores-campeoes", label: "Maiores Campeões", icon: "crown" },
  { to: "/minha-dupla", label: "Minha Dupla", icon: "team" },
  { to: "/grupos", label: "Grupos", icon: "group" },
  { to: "/jogos", label: "Jogos", icon: "matches" },
  { to: "/perfil", label: "Perfil", icon: "profile" },
];

export const PLAYER_BOTTOM_PRIMARY = ["/inicio", "/grupos", "/jogos", "/hall-da-fama"];

/** O modo de simulação existe apenas no build de desenvolvimento. */
export const IS_DEV_BUILD = import.meta.env.DEV;

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: "dashboard" },
  { to: "/admin/hall-da-fama", label: "Hall da Fama", icon: "ranking" },
  { to: "/admin/jogadores", label: "Jogadores", icon: "players" },
  { to: "/admin/duplas", label: "Duplas", icon: "team" },
  { to: "/admin/aprovacoes", label: "Aprovações", icon: "approvals" },
  { to: "/admin/grupos", label: "Grupos", icon: "group" },
  { to: "/admin/mesas-agora", label: "Ordem dos Jogos", icon: "tables" },
  { to: "/admin/escala", label: "Escala de Mesas", icon: "draw" },
  { to: "/admin/jogos", label: "Jogos", icon: "matches" },
  { to: "/admin/mata-mata", label: "Mata-mata", icon: "bracket" },
  ...(IS_DEV_BUILD ? ([{ to: "/admin/simulacao", label: "Simulação", icon: "simulation" }] as NavItem[]) : []),
  { to: "/admin/configuracoes", label: "Configurações", icon: "settings" },
];

export const ADMIN_BOTTOM_PRIMARY = ["/admin", "/admin/jogos", "/admin/mata-mata", "/admin/duplas"];

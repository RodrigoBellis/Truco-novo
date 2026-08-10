export type * from "@truco/shared";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

export interface NavItem {
  to: string;
  label: string;
  icon: NavIconName;
}

export type NavIconName =
  | "home"
  | "team"
  | "group"
  | "matches"
  | "results"
  | "standings"
  | "ranking"
  | "profile"
  | "dashboard"
  | "players"
  | "approvals"
  | "draw"
  | "bracket"
  | "history"
  | "settings"
  | "simulation"
  | "tables"
  | "logout";

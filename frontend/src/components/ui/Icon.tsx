import type { NavIconName } from "../../types";

interface IconProps {
  name: NavIconName | "menu" | "close" | "check" | "trophy" | "spade" | "star" | "arrow" | "bolt";
  size?: number;
}

const PATHS: Record<string, string> = {
  star: "m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.3L12 17.3 6.4 20.3l1-6.3L3 9.6l6.3-.9L12 3Z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  bolt: "m13 2-8 12h6l-1 8 9-13h-6l1-7Z",
  home: "M4 11.5 12 4l8 7.5M6 10v9h12v-9",
  team: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20c.7-3 2.9-5 5.5-5s4.8 2 5.5 5M10.5 20c.7-3 2.9-5 5.5-5s4.8 2 5.5 5",
  group: "M4 6h16M4 12h16M4 18h10",
  matches: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  results: "M9 12.5 11.2 15 15.5 9M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  standings: "M5 20V11M12 20V4M19 20v-7",
  ranking: "M8 21h8M12 17v4M6 4h12v3a6 6 0 0 1-12 0V4ZM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3",
  crown: "m3 8 4.5 4L12 4l4.5 8L21 8l-2 12H5L3 8Zm2 12h14",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.8-3.6 3.6-6 7-6s6.2 2.4 7 6",
  dashboard: "M4 4h7v7H4V4Zm9 0h7v4h-7V4Zm0 7h7v9h-7v-9ZM4 14h7v6H4v-6Z",
  players: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 20c.7-3 2.9-5 5.5-5s4.8 2 5.5 5M10.5 20c.7-3 2.9-5 5.5-5s4.8 2 5.5 5",
  approvals: "M9 12.5 11.2 15 15.5 9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  draw: "M4 6h5.5L18 18h2M4 18h5.5L15 10M15 6h5v5M15 18h5v-5",
  bracket: "M4 5h5v5H4V5Zm0 9h5v5H4v-5Zm11-9.5v5.5m0 0h5m-5 0v3.5m0 0h5m-5-3.5-6 0",
  history: "M12 8v5l3 2M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM4.6 13.5l-1.4.8v1.4l1.4.8.6 1.5-.8 1.4 1 1 1.4-.8 1.5.6.8 1.4h1.4l.8-1.4 1.5-.6 1.4.8 1-1-.8-1.4.6-1.5 1.4-.8v-1.4l-1.4-.8-.6-1.5.8-1.4-1-1-1.4.8-1.5-.6-.8-1.4h-1.4l-.8 1.4-1.5.6-1.4-.8-1 1 .8 1.4-.6 1.5Z",
  simulation: "M9 3h6M10 3v6.2L5.4 17a2 2 0 0 0 1.7 3h9.8a2 2 0 0 0 1.7-3L14 9.2V3M8 14h8",
  tables: "M4 5h7v7H4V5Zm9 0h7v7h-7V5ZM4 16h7v3H4v-3Zm9 0h7v3h-7v-3Z",
  logout: "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5 10 17l9-11",
  trophy: "M8 21h8M12 17v4M6 4h12v3a6 6 0 0 1-12 0V4ZM6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3",
  spade: "M12 3c-3.4 3.6-8 6.8-8 11a5 5 0 0 0 8 4c0 2-1 3-3 4h6c-2-1-3-2-3-4a5 5 0 0 0 8-4c0-4.2-4.6-7.4-8-11Z",
};

export function Icon({ name, size = 20 }: IconProps) {
  const path = PATHS[name] ?? PATHS.home;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

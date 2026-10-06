import { useEffect } from "react";
import { useAuth } from "./useAuth";
import { isAdminRole } from "../utils/roles";

type ChunkLoader = () => Promise<unknown>;

/* Mesmos módulos que o App carrega sob demanda: o bundler reaproveita o
   chunk, então chamar aqui só adianta o download. */
const PLAYER_CHUNKS: ChunkLoader[] = [
  () => import("../pages/player/PlayerHomePage"),
  () => import("../pages/OpeningPage"),
  () => import("../pages/HallOfFamePage"),
  () => import("../pages/MajorChampionsPage"),
  () => import("../pages/player/MyTeamPage"),
  () => import("../pages/player/GroupsPage"),
  () => import("../pages/player/PlayerMatchesPage"),
  () => import("../pages/player/ProfilePage"),
];

const ADMIN_CHUNKS: ChunkLoader[] = [
  () => import("../pages/admin/AdminDashboardPage"),
  () => import("../pages/admin/AdminPlayersPage"),
  () => import("../pages/admin/AdminTeamsPage"),
  () => import("../pages/admin/AdminApprovalsPage"),
  () => import("../pages/admin/AdminGroupsPage"),
  () => import("../pages/TablesLivePage"),
  () => import("../pages/admin/AdminSchedulePage"),
  () => import("../pages/admin/AdminMatchesPage"),
  () => import("../pages/admin/AdminBracketPage"),
  () => import("../pages/HallOfFamePage"),
  () => import("../pages/admin/AdminSettingsPage"),
];

/**
 * Baixa em segundo plano as telas do menu de quem está autenticado, com o
 * navegador ocioso. Sem isso cada primeira visita a uma tela mostra o
 * spinner do Suspense — e a transição entre telas anima o spinner em vez do
 * conteúdo. Respeita o modo de economia de dados.
 */
export function useRoutePrefetch() {
  const { user } = useAuth();
  const role = user?.role;

  useEffect(() => {
    if (!role) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    const loaders = isAdminRole(role) ? ADMIN_CHUNKS : PLAYER_CHUNKS;
    const run = () => {
      for (const load of loaders) void load().catch(() => undefined);
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 1200);
    return () => window.clearTimeout(id);
  }, [role]);
}

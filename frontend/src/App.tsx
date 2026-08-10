import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/routing/ProtectedRoute";
import { RequireAuth } from "./components/routing/RequireAuth";
import { AppShell } from "./components/layout/AppShell";
import { PublicLayout } from "./components/layout/PublicLayout";
import { LoginPage } from "./pages/LoginPage";
import { CreatePasswordPage } from "./pages/CreatePasswordPage";
import { RootRedirect } from "./pages/RootRedirect";
import { NotFoundPage } from "./pages/NotFoundPage";
import { HallOfFamePage } from "./pages/HallOfFamePage";
import { TablesLivePage } from "./pages/TablesLivePage";
import { PlayerHomePage } from "./pages/player/PlayerHomePage";
import { MyTeamPage } from "./pages/player/MyTeamPage";
import { MyGroupPage } from "./pages/player/MyGroupPage";
import { PlayerMatchesPage } from "./pages/player/PlayerMatchesPage";
import { PlayerResultsPage } from "./pages/player/PlayerResultsPage";
import { StandingsPage } from "./pages/player/StandingsPage";
import { ProfilePage } from "./pages/player/ProfilePage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminPlayersPage } from "./pages/admin/AdminPlayersPage";
import { AdminTeamsPage } from "./pages/admin/AdminTeamsPage";
import { AdminApprovalsPage } from "./pages/admin/AdminApprovalsPage";
import { AdminDrawPage } from "./pages/admin/AdminDrawPage";
import { AdminGroupsPage } from "./pages/admin/AdminGroupsPage";
import { AdminMatchesPage } from "./pages/admin/AdminMatchesPage";
import { AdminBracketPage } from "./pages/admin/AdminBracketPage";
import { AdminSettingsPage } from "./pages/admin/AdminSettingsPage";
import { AdminSimulationPage } from "./pages/admin/AdminSimulationPage";
import { AdminSchedulePage } from "./pages/admin/AdminSchedulePage";
import {
  PLAYER_NAV_ITEMS,
  PLAYER_BOTTOM_PRIMARY,
  ADMIN_NAV_ITEMS,
  ADMIN_BOTTOM_PRIMARY,
  IS_DEV_BUILD,
} from "./utils/navigation";

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/criar-senha" element={<CreatePasswordPage />} />
      </Route>

      <Route element={<PublicLayout />}>
        <Route path="/hall-da-fama" element={<HallOfFamePage />} />
        <Route path="/ranking" element={<Navigate to="/hall-da-fama" replace />} />
        <Route path="/historico" element={<Navigate to="/hall-da-fama" replace />} />
      </Route>

      <Route element={<ProtectedRoute role="jogador" />}>
        <Route element={<AppShell items={PLAYER_NAV_ITEMS} primaryPaths={PLAYER_BOTTOM_PRIMARY} />}>
          <Route path="/inicio" element={<PlayerHomePage />} />
          <Route path="/minha-dupla" element={<MyTeamPage />} />
          <Route path="/meu-grupo" element={<MyGroupPage />} />
          <Route path="/mesas-agora" element={<TablesLivePage />} />
          <Route path="/jogos" element={<PlayerMatchesPage />} />
          <Route path="/resultados" element={<PlayerResultsPage />} />
          <Route path="/classificacao" element={<StandingsPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="admin" />}>
        <Route element={<AppShell items={ADMIN_NAV_ITEMS} primaryPaths={ADMIN_BOTTOM_PRIMARY} />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/jogadores" element={<AdminPlayersPage />} />
          <Route path="/admin/duplas" element={<AdminTeamsPage />} />
          <Route path="/admin/aprovacoes" element={<AdminApprovalsPage />} />
          <Route path="/admin/sorteio" element={<AdminDrawPage />} />
          <Route path="/admin/grupos" element={<AdminGroupsPage />} />
          <Route path="/admin/mesas-agora" element={<TablesLivePage />} />
          <Route path="/admin/escala" element={<AdminSchedulePage />} />
          <Route path="/admin/jogos" element={<AdminMatchesPage />} />
          <Route path="/admin/mata-mata" element={<AdminBracketPage />} />
          <Route path="/admin/hall-da-fama" element={<HallOfFamePage />} />
          <Route path="/admin/ranking" element={<Navigate to="/admin/hall-da-fama" replace />} />
          <Route path="/admin/historico" element={<Navigate to="/admin/hall-da-fama" replace />} />
          {IS_DEV_BUILD && <Route path="/admin/simulacao" element={<AdminSimulationPage />} />}
          <Route path="/admin/configuracoes" element={<AdminSettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;

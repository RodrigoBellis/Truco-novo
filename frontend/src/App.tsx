import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/routing/ProtectedRoute";
import { RequireAuth } from "./components/routing/RequireAuth";
import { AppShell } from "./components/layout/AppShell";
import { PublicLayout } from "./components/layout/PublicLayout";
import { Loading } from "./components/ui/Loading";
import { useRoutePrefetch } from "./hooks/useRoutePrefetch";
import {
  PLAYER_NAV_ITEMS,
  PLAYER_BOTTOM_PRIMARY,
  ADMIN_NAV_ITEMS,
  ADMIN_BOTTOM_PRIMARY,
  IS_DEV_BUILD,
} from "./utils/navigation";

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const CreatePasswordPage = lazy(() => import("./pages/CreatePasswordPage").then((module) => ({ default: module.CreatePasswordPage })));
const RootRedirect = lazy(() => import("./pages/RootRedirect").then((module) => ({ default: module.RootRedirect })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })));
const HallOfFamePage = lazy(() => import("./pages/HallOfFamePage").then((module) => ({ default: module.HallOfFamePage })));
const MajorChampionsPage = lazy(() => import("./pages/MajorChampionsPage").then((module) => ({ default: module.MajorChampionsPage })));
const OpeningPage = lazy(() => import("./pages/OpeningPage").then((module) => ({ default: module.OpeningPage })));
const TablesLivePage = lazy(() => import("./pages/TablesLivePage").then((module) => ({ default: module.TablesLivePage })));
const PlayerHomePage = lazy(() => import("./pages/player/PlayerHomePage").then((module) => ({ default: module.PlayerHomePage })));
const MyTeamPage = lazy(() => import("./pages/player/MyTeamPage").then((module) => ({ default: module.MyTeamPage })));
const GroupsPage = lazy(() => import("./pages/player/GroupsPage").then((module) => ({ default: module.GroupsPage })));
const PlayerMatchesPage = lazy(() => import("./pages/player/PlayerMatchesPage").then((module) => ({ default: module.PlayerMatchesPage })));
const ProfilePage = lazy(() => import("./pages/player/ProfilePage").then((module) => ({ default: module.ProfilePage })));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage").then((module) => ({ default: module.AdminDashboardPage })));
const AdminPlayersPage = lazy(() => import("./pages/admin/AdminPlayersPage").then((module) => ({ default: module.AdminPlayersPage })));
const AdminTeamsPage = lazy(() => import("./pages/admin/AdminTeamsPage").then((module) => ({ default: module.AdminTeamsPage })));
const AdminApprovalsPage = lazy(() => import("./pages/admin/AdminApprovalsPage").then((module) => ({ default: module.AdminApprovalsPage })));
const AdminGroupsPage = lazy(() => import("./pages/admin/AdminGroupsPage").then((module) => ({ default: module.AdminGroupsPage })));
const AdminMatchesPage = lazy(() => import("./pages/admin/AdminMatchesPage").then((module) => ({ default: module.AdminMatchesPage })));
const AdminBracketPage = lazy(() => import("./pages/admin/AdminBracketPage").then((module) => ({ default: module.AdminBracketPage })));
const AdminSettingsPage = lazy(() => import("./pages/admin/AdminSettingsPage").then((module) => ({ default: module.AdminSettingsPage })));
const AdminSimulationPage = lazy(() => import("./pages/admin/AdminSimulationPage").then((module) => ({ default: module.AdminSimulationPage })));
const AdminSchedulePage = lazy(() => import("./pages/admin/AdminSchedulePage").then((module) => ({ default: module.AdminSchedulePage })));

function App() {
  useRoutePrefetch();

  return (
    <Suspense fallback={<Loading fullHeight label="Carregando tela..." />}>
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
          <Route path="/abertura" element={<OpeningPage />} />
          <Route path="/maiores-campeoes" element={<MajorChampionsPage />} />
          <Route path="/minha-dupla" element={<MyTeamPage />} />
          <Route path="/grupos" element={<GroupsPage />} />
          <Route path="/jogos" element={<PlayerMatchesPage />} />
          <Route path="/meu-grupo" element={<Navigate to="/grupos" replace />} />
          <Route path="/classificacao" element={<Navigate to="/grupos" replace />} />
          <Route path="/mesas-agora" element={<Navigate to="/jogos" replace />} />
          <Route path="/ordem-dos-jogos" element={<Navigate to="/jogos" replace />} />
          <Route path="/resultados" element={<Navigate to="/jogos" replace />} />
          <Route path="/perfil" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="admin" />}>
        <Route element={<AppShell items={ADMIN_NAV_ITEMS} primaryPaths={ADMIN_BOTTOM_PRIMARY} />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/jogadores" element={<AdminPlayersPage />} />
          <Route path="/admin/duplas" element={<AdminTeamsPage />} />
          <Route path="/admin/aprovacoes" element={<AdminApprovalsPage />} />
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
    </Suspense>
  );
}

export default App;

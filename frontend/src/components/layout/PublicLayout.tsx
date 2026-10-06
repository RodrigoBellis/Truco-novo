import { Link, NavLink, Outlet } from "react-router-dom";
import { Logo } from "../ui/Logo";
import { useAuth } from "../../hooks/useAuth";
import { isAdminRole } from "../../utils/roles";
import { AppShell } from "./AppShell";
import { ADMIN_BOTTOM_PRIMARY, ADMIN_NAV_ITEMS, PLAYER_BOTTOM_PRIMARY, PLAYER_NAV_ITEMS } from "../../utils/navigation";
import "./PublicLayout.css";

export function PublicLayout() {
  const { user } = useAuth();

  if (user) {
    const isAdmin = isAdminRole(user.role);
    return <AppShell items={isAdmin ? ADMIN_NAV_ITEMS : PLAYER_NAV_ITEMS} primaryPaths={isAdmin ? ADMIN_BOTTOM_PRIMARY : PLAYER_BOTTOM_PRIMARY} />;
  }

  return (
    <div className="public-layout">
      <header className="public-header">
        <Link to="/">
          <Logo size={32} />
        </Link>
        <nav className="public-header-nav">
          <NavLink
            to="/hall-da-fama"
            viewTransition
            className={({ isActive }) => (isActive ? "public-header-link-active" : "")}
          >
            Hall da Fama
          </NavLink>
        </nav>
        <Link to="/login" className="public-header-cta">
          Entrar
        </Link>
      </header>

      <main className="container public-main">
        <Outlet />
      </main>
    </div>
  );
}

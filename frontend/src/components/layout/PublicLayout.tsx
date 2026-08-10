import { Link, NavLink, Outlet } from "react-router-dom";
import { Logo } from "../ui/Logo";
import { useAuth } from "../../hooks/useAuth";
import { homePathForRole } from "../../utils/roles";
import "./PublicLayout.css";

export function PublicLayout() {
  const { user } = useAuth();

  return (
    <div className="public-layout">
      <header className="public-header">
        <Link to="/">
          <Logo size={32} />
        </Link>
        <nav className="public-header-nav">
          <NavLink to="/hall-da-fama" className={({ isActive }) => (isActive ? "public-header-link-active" : "")}>
            Hall da Fama
          </NavLink>
        </nav>
        <Link to={user ? homePathForRole(user.role) : "/login"} className="public-header-cta">
          {user ? "Voltar ao painel" : "Entrar"}
        </Link>
      </header>

      <main className="container public-main">
        <Outlet />
      </main>
    </div>
  );
}

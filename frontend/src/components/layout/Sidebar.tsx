import { NavLink } from "react-router-dom";
import { Logo } from "../ui/Logo";
import { Icon } from "../ui/Icon";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useAuth } from "../../hooks/useAuth";
import type { NavItem } from "../../types";
import { isAdminRole } from "../../utils/roles";
import "./Sidebar.css";

interface SidebarProps {
  items: NavItem[];
}

export function Sidebar({ items }: SidebarProps) {
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Logo />
        <ThemeToggle />
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/admin"}
            className={({ isActive }) => `sidebar-link${isActive ? " sidebar-link-active" : ""}`}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="sidebar-user-avatar sidebar-user-avatar-img" />
          ) : (
            <div className="sidebar-user-avatar">{user?.name.slice(0, 1).toUpperCase()}</div>
          )}
          <div className="sidebar-user-info">
            <strong>{user?.name}</strong>
            <span className="text-faint">{isAdminRole(user?.role) ? "Administrador" : "Jogador"}</span>
          </div>
        </div>
        <button type="button" className="sidebar-logout" onClick={logout}>
          <Icon name="logout" size={18} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}

import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { useAuth } from "../../hooks/useAuth";
import type { NavItem } from "../../types";
import "./BottomNav.css";

interface BottomNavProps {
  items: NavItem[];
  primaryPaths: string[];
}

export function BottomNav({ items, primaryPaths }: BottomNavProps) {
  const [showMore, setShowMore] = useState(false);
  const location = useLocation();
  const { logout } = useAuth();

  const primaryItems = primaryPaths
    .map((path) => items.find((item) => item.to === path))
    .filter((item): item is NavItem => Boolean(item));
  const overflowItems = items.filter((item) => !primaryPaths.includes(item.to));
  const isOverflowActive = overflowItems.some((item) => location.pathname === item.to);

  return (
    <>
      <nav className="bottom-nav">
        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/admin"}
            className={({ isActive }) => `bottom-nav-item${isActive ? " bottom-nav-item-active" : ""}`}
          >
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        {overflowItems.length > 0 && (
          <button
            type="button"
            className={`bottom-nav-item${isOverflowActive ? " bottom-nav-item-active" : ""}`}
            onClick={() => setShowMore(true)}
          >
            <Icon name="menu" size={22} />
            <span>Mais</span>
          </button>
        )}
      </nav>

      {showMore && (
        <div className="more-sheet-overlay" role="presentation" onClick={() => setShowMore(false)}>
          <div className="more-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="more-sheet-handle" />
            <div className="more-sheet-grid">
              {overflowItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="more-sheet-item"
                  onClick={() => setShowMore(false)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
              <button type="button" className="more-sheet-item more-sheet-logout" onClick={logout}>
                <Icon name="logout" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

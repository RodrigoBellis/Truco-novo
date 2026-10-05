import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
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

  // Arrastar para baixo fecha o painel — é como todo bottom sheet de celular
  // se comporta, e evita a mira no botão de fechar com o polegar.
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const CLOSE_THRESHOLD_PX = 80;

  function handleDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    dragStartY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    // Durante o arrasto o painel precisa seguir o dedo sem suavização.
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }

  function handleDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null || !sheetRef.current) return;
    // Só para baixo: puxar para cima não deve descolar o painel da base.
    const offset = Math.max(0, event.clientY - dragStartY.current);
    sheetRef.current.style.transform = `translateY(${offset}px)`;
  }

  function handleDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null || !sheetRef.current) return;
    const offset = Math.max(0, event.clientY - dragStartY.current);
    dragStartY.current = null;

    // Devolve a transição do CSS para que o painel volte deslizando caso o
    // arrasto não tenha chegado ao limite.
    sheetRef.current.style.transition = "";
    sheetRef.current.style.transform = "";

    if (offset > CLOSE_THRESHOLD_PX) setShowMore(false);
  }

  return (
    <>
      <nav className="bottom-nav">
        {primaryItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/admin"}
            viewTransition
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
          <div className="more-sheet" ref={sheetRef} onClick={(event) => event.stopPropagation()}>
            <div
              className="more-sheet-grip"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              <div className="more-sheet-handle" />
            </div>
            <div className="more-sheet-grid">
              {overflowItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  viewTransition
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

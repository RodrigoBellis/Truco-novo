import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { MobileTopbar } from "./MobileTopbar";
import type { NavItem } from "../../types";
import "./AppShell.css";

interface AppShellProps {
  items: NavItem[];
  primaryPaths: string[];
}

export function AppShell({ items, primaryPaths }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar items={items} />
      <MobileTopbar />
      <main className="app-shell-content">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <BottomNav items={items} primaryPaths={primaryPaths} />
    </div>
  );
}

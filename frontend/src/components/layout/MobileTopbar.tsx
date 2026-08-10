import { Logo } from "../ui/Logo";
import { ThemeToggle } from "../ui/ThemeToggle";
import "./MobileTopbar.css";

export function MobileTopbar() {
  return (
    <header className="mobile-topbar">
      <Logo size={28} />
      <ThemeToggle />
    </header>
  );
}

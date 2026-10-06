import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext, type Theme } from "./theme-context";

const STORAGE_KEY = "truco-do-novo:theme";
const APPEARANCE_KEY = "truco-do-novo:appearance-version";
const APPEARANCE_VERSION = "black-background-v1";

function readStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "dark" || raw === "light" ? raw : null;
  } catch {
    return null;
  }
}

/** Fundo preto restaurado; a escolha posterior pelo tema claro continua disponível. */
function initialTheme(): Theme {
  return readStoredTheme() ?? "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    let appliedTheme = theme;
    try {
      // Aplicar a direção restaurada uma vez também aos navegadores que
      // ficaram com a aparência clara salva durante a rodada anterior.
      if (window.localStorage.getItem(APPEARANCE_KEY) !== APPEARANCE_VERSION) {
        appliedTheme = "dark";
        window.localStorage.setItem(APPEARANCE_KEY, APPEARANCE_VERSION);
        window.localStorage.setItem(STORAGE_KEY, appliedTheme);
      }
    } catch {
      // A alternância continua funcionando sem armazenamento disponível.
    }
    if (appliedTheme !== theme) setThemeState(appliedTheme);
    document.documentElement.setAttribute("data-theme", appliedTheme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sem localStorage disponível: o tema só vale para a sessão atual.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

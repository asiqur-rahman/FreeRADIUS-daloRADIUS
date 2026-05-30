import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AppTheme = "current" | "white";

type ThemeContextValue = {
  theme: AppTheme;
  isWhiteTheme: boolean;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "radiusops-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "current";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "white" ? "white" : "current";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(readStoredTheme);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "white" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isWhiteTheme: theme === "white",
      setTheme,
      toggleTheme: () => setTheme((current) => (current === "white" ? "current" : "white")),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}

import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: Props) {
  const { theme, isWhiteTheme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-ghost-button theme-toggle-pill inline-flex items-center justify-center gap-2 ${
        compact ? "h-10 w-10 rounded-2xl px-0" : "rounded-2xl px-4 py-3 text-sm font-medium"
      }`}
      title={isWhiteTheme ? "Switch to current theme" : "Switch to white theme"}
      aria-label={isWhiteTheme ? "Switch to current theme" : "Switch to white theme"}
      data-theme-toggle={theme}
    >
      {isWhiteTheme ? <MoonStar className="h-4.5 w-4.5" /> : <SunMedium className="h-4.5 w-4.5" />}
      {!compact && <span>{isWhiteTheme ? "Current" : "White"}</span>}
    </button>
  );
}

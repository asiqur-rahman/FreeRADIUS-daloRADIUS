import { Download, Share2 } from "lucide-react";
import { usePwaInstall } from "../pwa/PwaInstallContext";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  compact?: boolean;
  className?: string;
};

export function PwaInstallButton({ compact = false, className = "" }: Props) {
  const { busy, isSupported, mode, install, openPrompt } = usePwaInstall();
  const { isWhiteTheme } = useTheme();

  if (!isSupported) return null;

  const label = mode === "ios" ? "Install" : mode === "manual" ? "Install" : busy ? "Installing..." : "Install";
  const Icon = mode === "ios" ? Share2 : Download;
  const baseClass = compact
    ? `inline-flex h-10 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-medium transition ${
        isWhiteTheme
          ? "border-slate-200 bg-white/85 text-slate-600 hover:bg-white hover:text-slate-950"
          : "border-white/8 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
      }`
    : `inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
        isWhiteTheme
          ? "border-slate-200 bg-white/85 text-slate-600 hover:bg-white hover:text-slate-950"
          : "border-white/8 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white"
      }`;

  const handleClick = () => {
    if (mode === "ios" || mode === "manual") {
      openPrompt();
      return;
    }
    void install();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`${baseClass} ${className}`.trim()}
      title={mode === "ios" || mode === "manual" ? "Show install steps" : "Install app"}
    >
      <Icon className={`h-4 w-4 ${busy && mode !== "ios" ? "animate-pulse" : ""}`} />
      <span>{label}</span>
    </button>
  );
}

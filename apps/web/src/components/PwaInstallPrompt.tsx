import { useMemo } from "react";
import { Download, Plus, Share2, Smartphone, Sparkles, X, Zap } from "lucide-react";
import { usePwaInstall } from "../pwa/PwaInstallContext";
import { useTheme } from "../theme/ThemeContext";

export function PwaInstallPrompt() {
  const { isWhiteTheme } = useTheme();
  const { busy, dismissPrompt, install, mode, visible } = usePwaInstall();

  const body = useMemo(() => {
    if (mode === "ios") {
      return {
        eyebrow: "Install RadiusOps",
        title: "Do you want to install this app?",
        description:
          "Add RadiusOps to your home screen for faster launch and a cleaner app-like view.",
        ctaLabel: "Show steps",
        benefits: [
          { icon: Smartphone, label: "Home screen" },
          { icon: Zap, label: "Fast launch" },
          { icon: Sparkles, label: "Full screen" },
        ],
      };
    }

    if (mode === "manual") {
      return {
        eyebrow: "Install RadiusOps",
        title: "Do you want to install this app?",
        description:
          "Your browser can still install RadiusOps from its menu, even when the system prompt is not shown automatically.",
        ctaLabel: "Show steps",
        benefits: [
          { icon: Smartphone, label: "App feel" },
          { icon: Zap, label: "Quick launch" },
          { icon: Sparkles, label: "Clean view" },
        ],
      };
    }

    return {
      eyebrow: "Install RadiusOps",
      title: "Do you want to install this app?",
      description:
        "Install RadiusOps for faster launch, less browser clutter, and a cleaner full-screen workspace.",
      ctaLabel: busy ? "Preparing..." : "Install now",
      benefits: [
        { icon: Smartphone, label: "App feel" },
        { icon: Zap, label: "Quick access" },
        { icon: Sparkles, label: "Less clutter" },
      ],
    };
  }, [busy, mode]);

  const handleInstall = async () => {
    if (mode === "manual") {
      handleDismiss();
      return;
    }

    await install();
  };

  const handleDismiss = () => {
    dismissPrompt(true);
  };

  if (!visible || !mode) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Dismiss install prompt"
        className={`absolute inset-0 ${isWhiteTheme ? "bg-slate-900/12" : "bg-slate-950/46"} backdrop-blur-[2px]`}
        onClick={handleDismiss}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-3 safe-bottom md:inset-0 md:flex md:items-center md:justify-center md:px-4 md:pb-0">
        <div className="pointer-events-auto mx-auto max-w-xl md:mx-0 md:w-full md:max-w-md">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install RadiusOps"
          className={`${isWhiteTheme ? "theme-surface-strong" : "surface-dark-strong"} card-rise relative overflow-hidden rounded-[30px]`}
        >
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-sky-400/18 via-cyan-300/10 to-teal-400/18 blur-2xl" />
          <div className="relative px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-white/12 md:hidden" />

            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-400 text-slate-950 shadow-lg shadow-sky-500/20">
                {mode === "ios" ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className={`text-[11px] uppercase tracking-[0.28em] ${isWhiteTheme ? "text-sky-600" : "text-sky-300"}`}>
                  {body.eyebrow}
                </div>
                <h3 className={`mt-2 text-lg font-semibold tracking-tight ${isWhiteTheme ? "text-slate-950" : "text-white"}`}>
                  {body.title}
                </h3>
                <p className={`mt-2 text-sm leading-6 ${isWhiteTheme ? "text-slate-600" : "text-slate-400"}`}>
                  {body.description}
                </p>
              </div>

              <button
                onClick={handleDismiss}
                aria-label="Dismiss install prompt"
                className={`rounded-full p-1.5 transition ${isWhiteTheme ? "text-slate-500 hover:bg-slate-100 hover:text-slate-950" : "text-slate-500 hover:bg-white/5 hover:text-slate-300"}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {body.benefits.map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <div
                    key={benefit.label}
                    className={`rounded-[20px] border px-3 py-3 text-center ${isWhiteTheme ? "border-slate-200 bg-slate-50/90" : "border-white/6 bg-white/[0.03]"}`}
                  >
                    <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-2xl ${isWhiteTheme ? "bg-white text-sky-600" : "bg-white/[0.05] text-sky-200"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className={`mt-2 text-[11px] font-medium leading-4 ${isWhiteTheme ? "text-slate-700" : "text-slate-300"}`}>
                      {benefit.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {(mode === "ios" || mode === "manual") && (
              <div className={`mt-4 rounded-[22px] border px-4 py-4 text-sm ${isWhiteTheme ? "border-slate-200 bg-slate-50/90 text-slate-700" : "border-white/6 bg-white/[0.03] text-slate-300"}`}>
                <div className={`font-medium ${isWhiteTheme ? "text-slate-950" : "text-white"}`}>How to install</div>
                <div className="mt-3 flex items-start gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${isWhiteTheme ? "bg-white text-sky-600" : "bg-white/[0.06] text-sky-200"}`}>
                    {mode === "ios" ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  </div>
                  <div className="leading-6">
                    {mode === "ios" ? (
                      <>
                        Tap <span className={`font-medium ${isWhiteTheme ? "text-slate-950" : "text-white"}`}>Share</span>, then choose{" "}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${isWhiteTheme ? "bg-white text-slate-950" : "bg-white/[0.06] text-white"}`}>
                          <Plus className="h-3 w-3" />
                          Add to Home Screen
                        </span>
                        .
                      </>
                    ) : (
                      <>
                        Open your browser menu, then choose{" "}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${isWhiteTheme ? "bg-white text-slate-950" : "bg-white/[0.06] text-white"}`}>
                          <Download className="h-3 w-3" />
                          Install app
                        </span>
                        {" "}or{" "}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${isWhiteTheme ? "bg-white text-slate-950" : "bg-white/[0.06] text-white"}`}>
                          <Plus className="h-3 w-3" />
                          Add to Home Screen
                        </span>
                        .
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className={`mt-4 rounded-[20px] border px-4 py-3 text-sm ${isWhiteTheme ? "border-slate-200 bg-slate-50/90 text-slate-600" : "border-white/6 bg-white/[0.03] text-slate-400"}`}>
              {mode === "native"
                ? "You can keep using the browser too. Installing only makes access faster and cleaner."
                : "You can skip this for now and keep using RadiusOps in your browser at any time."}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleInstall}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {mode === "ios" ? (
                  <Smartphone className="h-4 w-4" />
                ) : mode === "manual" ? (
                  <Download className="h-4 w-4" />
                ) : busy ? (
                  <Download className="h-4 w-4 animate-pulse" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {body.ctaLabel}
              </button>
              <button
                onClick={handleDismiss}
                className={`rounded-[18px] border px-4 py-3 text-sm font-medium transition ${isWhiteTheme ? "border-slate-200 text-slate-600 hover:bg-white hover:text-slate-950" : "border-white/8 text-slate-300 hover:bg-white/[0.05] hover:text-white"}`}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Share2, Smartphone, Sparkles, X, Zap } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PromptMode = "native" | "ios" | null;

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_FOR_MS = 1000 * 60 * 60 * 24 * 3;

function isStandalone() {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const crios = /CriOS/.test(ua);
  const fxios = /FxiOS/.test(ua);
  return ios && webkit && !crios && !fxios;
}

function shouldSuppressPrompt() {
  const dismissedAt = window.localStorage.getItem(DISMISS_KEY);
  if (!dismissedAt) return false;

  const age = Date.now() - Number(dismissedAt);
  return Number.isFinite(age) && age < DISMISS_FOR_MS;
}

function rememberDismissal() {
  window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

export function PwaInstallPrompt() {
  const { isWhiteTheme } = useTheme();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<PromptMode>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldSuppressPrompt()) return;
    if (isStandalone()) return;

    let revealTimer: ReturnType<typeof setTimeout> | null = null;

    if (isIosSafari()) {
      revealTimer = setTimeout(() => {
        setMode("ios");
        setVisible(true);
      }, 1400);
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (shouldSuppressPrompt() || isStandalone()) return;

      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        setMode("native");
        setVisible(true);
      }, 1200);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (revealTimer) clearTimeout(revealTimer);
    };
  }, []);

  const body = useMemo(() => {
    if (mode === "ios") {
      return {
        eyebrow: "Install on iPhone",
        title: "Use RadiusOps as an app.",
        description:
          "Add it to your home screen for faster, cleaner access.",
        ctaLabel: "Got it",
        benefits: [
          { icon: Smartphone, label: "Home screen" },
          { icon: Zap, label: "Fast launch" },
          { icon: Sparkles, label: "Full screen" },
        ],
      };
    }

    return {
      eyebrow: "Install workspace",
      title: "Keep RadiusOps close.",
      description:
        "Install for faster launch and a cleaner full-screen view.",
      ctaLabel: busy ? "Preparing..." : "Install app",
      benefits: [
        { icon: Smartphone, label: "App feel" },
        { icon: Zap, label: "Quick access" },
        { icon: Sparkles, label: "Less clutter" },
      ],
    };
  }, [busy, mode]);

  const handleInstall = async () => {
    if (mode === "ios") {
      rememberDismissal();
      setVisible(false);
      return;
    }

    if (!deferredPrompt) return;

    setBusy(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") rememberDismissal();
      setDeferredPrompt(null);
      setVisible(false);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    rememberDismissal();
    setVisible(false);
  };

  if (!visible || !mode) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3 safe-bottom md:bottom-4 md:right-4 md:left-auto md:w-full md:max-w-sm md:px-0 md:pb-0">
        <div className="pointer-events-auto mx-auto max-w-xl md:mx-0 md:max-w-sm">
        <div className={`${isWhiteTheme ? "theme-surface-strong" : "surface-dark-strong"} card-rise relative overflow-hidden rounded-[30px]`}>
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

            {mode === "ios" && (
              <div className={`mt-4 rounded-[22px] border px-4 py-4 text-sm ${isWhiteTheme ? "border-slate-200 bg-slate-50/90 text-slate-700" : "border-white/6 bg-white/[0.03] text-slate-300"}`}>
                <div className={`font-medium ${isWhiteTheme ? "text-slate-950" : "text-white"}`}>How to install</div>
                <div className="mt-3 flex items-start gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${isWhiteTheme ? "bg-white text-sky-600" : "bg-white/[0.06] text-sky-200"}`}>
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div className="leading-6">
                    Tap <span className={`font-medium ${isWhiteTheme ? "text-slate-950" : "text-white"}`}>Share</span>, then choose{" "}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${isWhiteTheme ? "bg-white text-slate-950" : "bg-white/[0.06] text-white"}`}>
                      <Plus className="h-3 w-3" />
                      Add to Home Screen
                    </span>
                    .
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleInstall}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {mode === "ios" ? (
                  <Smartphone className="h-4 w-4" />
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
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

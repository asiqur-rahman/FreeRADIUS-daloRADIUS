import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PromptMode = "native" | "ios" | "manual" | null;

interface PwaInstallContextValue {
  busy: boolean;
  mode: PromptMode;
  visible: boolean;
  isSupported: boolean;
  openPrompt: () => void;
  dismissPrompt: (remember?: boolean) => void;
  install: () => Promise<void>;
}

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_FOR_MS = 1000 * 60 * 60 * 24 * 3;

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

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

export function PwaInstallProvider({ children }: PropsWithChildren) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<PromptMode>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;

    let revealTimer: ReturnType<typeof setTimeout> | null = null;

    if (isIosSafari()) {
      setMode("ios");
      if (!shouldSuppressPrompt()) {
        revealTimer = setTimeout(() => {
          setVisible(true);
        }, 1400);
      }
    } else {
      setMode("manual");
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setMode("native");

      if (shouldSuppressPrompt() || isStandalone()) return;

      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        setVisible(true);
      }, 1200);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (revealTimer) clearTimeout(revealTimer);
    };
  }, []);

  const dismissPrompt = useCallback((remember = true) => {
    if (remember) rememberDismissal();
    setVisible(false);
  }, []);

  const openPrompt = useCallback(() => {
    if (isStandalone()) return;
    if (!deferredPrompt && mode === null) return;
    setVisible(true);
  }, [deferredPrompt, mode]);

  const install = useCallback(async () => {
    if (mode === "ios" || mode === "manual") {
      setVisible(true);
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
  }, [deferredPrompt, mode]);

  const value = useMemo<PwaInstallContextValue>(() => ({
    busy,
    mode,
    visible,
    isSupported: mode !== null || Boolean(deferredPrompt),
    openPrompt,
    dismissPrompt,
    install,
  }), [busy, deferredPrompt, dismissPrompt, install, mode, openPrompt, visible]);

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall() {
  const context = useContext(PwaInstallContext);
  if (!context) throw new Error("usePwaInstall must be used within a PwaInstallProvider");
  return context;
}

import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";

export function PwaUpdateBanner() {
  const { isWhiteTheme } = useTheme();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Poll for updates every 60 minutes while the tab is open
      if (r) setInterval(() => r.update(), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 bottom-[calc(13rem+env(safe-area-inset-bottom))] md:bottom-auto md:top-4"
    >
      <div className={`flex items-center gap-3 rounded-[24px] border px-4 py-3 shadow-2xl backdrop-blur-sm ${isWhiteTheme ? "border-slate-200 bg-white/95" : "border-white/10 bg-zinc-900/95"}`}>
        <RefreshCw className="h-4 w-4 shrink-0 text-blue-400" />
        <p className={`flex-1 text-sm ${isWhiteTheme ? "text-slate-700" : "text-zinc-200"}`}>
          A new version is available.
        </p>
        <button
          onClick={() => updateServiceWorker(true)}
          className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 active:bg-blue-700"
        >
          Update
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Dismiss"
          className={`rounded-full p-1 transition-colors ${isWhiteTheme ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

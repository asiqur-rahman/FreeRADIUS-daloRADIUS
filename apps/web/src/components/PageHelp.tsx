import { useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";

interface PageHelpProps {
  title: string;
  description: string;
  tips?: string[];
}

/**
 * Small (i) button that opens a contextual help popover.
 * Place it next to any page or section heading.
 */
export function PageHelp({ title, description, tips }: PageHelpProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { isWhiteTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`About ${title}`}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
          open
            ? "border-indigo-500 bg-indigo-500/10 text-indigo-400"
            : isWhiteTheme
              ? "border-slate-300 text-slate-500 hover:border-indigo-500 hover:text-indigo-500"
              : "border-zinc-700 text-zinc-500 hover:border-indigo-500 hover:text-indigo-400"
        }`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className={`absolute left-0 top-8 z-50 w-80 rounded-xl border p-4 shadow-2xl ${
            isWhiteTheme
              ? "border-slate-200 bg-white/98 shadow-slate-300/30"
              : "border-zinc-700 bg-zinc-900 shadow-black/50"
          }`}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h4 className={`text-sm font-semibold leading-tight ${isWhiteTheme ? "text-slate-950" : "text-white"}`}>{title}</h4>
            <button
              onClick={() => setOpen(false)}
              className={`shrink-0 transition-colors ${
                isWhiteTheme ? "text-slate-400 hover:text-slate-700" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className={`text-xs leading-relaxed ${isWhiteTheme ? "text-slate-600" : "text-zinc-400"}`}>{description}</p>
          {tips && tips.length > 0 && (
            <ul className={`mt-3 space-y-1.5 border-t pt-3 ${isWhiteTheme ? "border-slate-200" : "border-zinc-800"}`}>
              {tips.map((tip, index) => (
                <li key={index} className={`flex items-start gap-2 text-xs ${isWhiteTheme ? "text-slate-600" : "text-zinc-400"}`}>
                  <span className="mt-0.5 shrink-0 text-indigo-400">•</span>
                  <span className="leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";

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
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${
          open
            ? "border-indigo-500 text-indigo-400 bg-indigo-500/10"
            : "border-zinc-700 text-zinc-500 hover:border-indigo-500 hover:text-indigo-400"
        }`}
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-50 w-80 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/50 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-white leading-tight">{title}</h4>
            <button
              onClick={() => setOpen(false)}
              className="flex-shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
          {tips && tips.length > 0 && (
            <ul className="mt-3 space-y-1.5 pt-3 border-t border-zinc-800">
              {tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                  <span className="text-indigo-400 flex-shrink-0 mt-0.5">•</span>
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

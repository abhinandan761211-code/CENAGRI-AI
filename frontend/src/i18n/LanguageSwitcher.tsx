import { useEffect, useRef, useState } from "react";
import { Check, Globe, Search } from "lucide-react";
import { useLang } from "./LanguageContext";
import { LANGUAGES, TRANSLATED } from "./languages";
import type { LanguageCode } from "./languages";

const CURRENT_LABEL: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.native])
);

type Props = {
  /** "hero" sits over the dark landing header, "solid" on white, "panel" in a form,
   *  "dark" inside the navy footer. */
  tone?: "hero" | "solid" | "panel" | "dark";
  className?: string;
  /** Compact: only the globe + native name (used in tight phone headers). */
  compact?: boolean;
};

/**
 * Language switcher for the public pages.
 *
 * All 22 scheduled languages are listed, each in its own script, so a visitor
 * can recognise their language without reading English. Languages with a
 * translation file are selectable and marked with a tick; the rest are shown
 * greyed with "coming" so the list is honest rather than promising text that
 * would silently fall back to English.
 */
export default function LanguageSwitcher({ tone = "solid", className = "", compact }: Props) {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Start typing in Hindi and you expect Hindi results first, so the search
  // matches native script, English name and the code.
  const q = query.trim().toLowerCase();
  const results = q
    ? LANGUAGES.filter(
      (l) =>
        l.native.toLowerCase().includes(q) ||
        l.english.toLowerCase().includes(q) ||
        l.code.includes(q)
    )
    : LANGUAGES;

  const triggerClass =
    tone === "hero"
      ? "landing-header-lang"
      : tone === "panel"
        ? "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
        : tone === "dark"
          ? "border border-white/15 bg-white/5 text-brand-100 hover:bg-white/10"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("common.changeLanguage")}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${triggerClass}`}
      >
        <Globe className="h-4 w-4 shrink-0" />
        {compact ? null : <span className="max-w-[7.5rem] truncate">{CURRENT_LABEL[lang] ?? "English"}</span>}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("common.language")}
          className="absolute right-0 z-[60] mt-2 w-[290px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.language")}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-sm outline-none focus:border-brand-600 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <ul className="max-h-[min(60vh,340px)] overflow-y-auto p-1.5">
            {results.map((l) => {
              const available = TRANSLATED.has(l.code);
              const active = l.code === lang;
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-disabled={!available}
                    disabled={!available}
                    onClick={() => {
                      setLang(l.code as LanguageCode);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${active
                      ? "bg-brand-50 font-semibold text-brand-800"
                      : available
                        ? "text-slate-700 hover:bg-slate-50"
                        : "cursor-not-allowed text-slate-400"
                      }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate leading-snug" lang={l.code} dir={l.dir}>
                        {l.native}
                      </span>
                      <span className="text-[11px] font-normal text-slate-400">{l.english}</span>
                    </span>
                    {active ? (
                      <Check className="h-4 w-4 shrink-0 text-brand-700" />
                    ) : !available ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {t("common.coming")}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {results.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-slate-400">—</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

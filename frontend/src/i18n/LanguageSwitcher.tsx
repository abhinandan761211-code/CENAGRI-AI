import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Globe, Search } from "lucide-react";
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
  /**
   * Show a label above the trigger ("Language Settings" in the app sidebar).
   * The trigger alone reads as a plain button there, and a farmer looking for
   * the language setting should not have to guess what the globe does.
   */
  label?: string;
};

/**
 * Language switcher for the public pages.
 *
 * All 22 scheduled languages are listed, each in its own script, so a visitor
 * can recognise their language without reading English. Languages with a
 * translation file are selectable and marked with a tick; the rest are shown
 * greyed with "coming" so the list is honest rather than promising text that
 * would silently fall back to English.
 *
 * The panel is rendered in a portal on `document.body` and positioned from the
 * trigger's measured rect. It used to be an absolutely-positioned child, which
 * broke in two places: the phone drawer is a scrolling column, so the panel was
 * clipped by it and could not scroll, and the app header's menus are
 * `overflow: hidden`, so the list was cut off there too. A fixed, portalled
 * panel is never clipped by an ancestor and always scrolls on its own.
 */
export default function LanguageSwitcher({ tone = "solid", className = "", compact, label }: Props) {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /**
   * True while the panel is open.
   *
   * The panel is portalled to <body>, so it is NOT inside the trigger's DOM
   * subtree. Any ancestor that closes its own popover on an outside
   * `mousedown` (the app header's settings menu does exactly this) would see a
   * tap on a language as "outside" and unmount the switcher before the click
   * landed — the list closed and nothing changed. Those handlers run on the
   * same mousedown, so the panel marks the event as handled and they skip it.
   */
  const openRef = useRef(false);
  openRef.current = open;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        // Keep ancestor popovers (the app header menu) from closing on this tap.
        e.stopPropagation();
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Capture phase: run before the ancestor's bubble-phase handler.
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /*
   * Place the panel under the trigger, inside the viewport.
   *
   * Right-aligned to the trigger where there is room (the desktop header), and
   * pulled back inside the screen where there is not (the phone drawer centres
   * the trigger, so a 290px panel used to run off the left edge). The height is
   * capped to the space below the trigger so the list scrolls instead of
   * running under the bottom of the screen.
   */
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = rootRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const margin = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const anchor = trigger.getBoundingClientRect();
      const width = Math.min(290, vw - margin * 2);

      let left = anchor.right - width;
      if (left < margin) left = margin;
      if (left + width > vw - margin) left = vw - margin - width;

      const top = anchor.bottom + 8;
      const maxHeight = Math.max(220, vh - top - margin);

      setPos({ top, left, width, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    // The drawer and the page both scroll, so the trigger can move without a
    // resize event — re-place on any scroll of an ancestor.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
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
      {label && (
        <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          {label}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("common.changeLanguage")}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${triggerClass}`}
      >
        <Globe className="h-4 w-4 shrink-0" />
        {compact ? null : (
          <span className="min-w-0 flex-1 truncate text-left">{CURRENT_LABEL[lang] ?? "English"}</span>
        )}
        {compact ? null : <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={t("common.language")}
            style={{
              position: "fixed",
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: pos?.width ?? 290,
              maxHeight: pos?.maxHeight ?? 340,
              // Hidden for the one frame before the trigger has been measured.
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-[80] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="shrink-0 border-b border-slate-100 p-2.5">
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

            <ul
              ref={listRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
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
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm transition ${active
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
          </div>,
          document.body
        )}
    </div>
  );
}

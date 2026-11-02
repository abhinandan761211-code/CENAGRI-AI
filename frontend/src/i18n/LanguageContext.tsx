import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  detectBrowserLanguage,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  scriptFontStack,
} from "./languages";
import type { LanguageCode } from "./languages";
import en from "./locales/en";
import type { TranslationKey } from "./locales/en";

/**
 * "Some keys can't be translated" marker — used where a list index or a
 * single word (a role name, a crop) is shared with the database and must stay
 * in English. Anything that is only read on screen is translated.
 */
export type LocaleValue = string | readonly string[];
export type LocaleDict = Record<string, LocaleValue>;

const LOADERS: Record<string, () => Promise<{ default: LocaleDict }>> = {
  hi: () => import("./locales/hi"),
  bn: () => import("./locales/bn"),
  ta: () => import("./locales/ta"),
  te: () => import("./locales/te"),
  mr: () => import("./locales/mr"),
  gu: () => import("./locales/gu"),
  kn: () => import("./locales/kn"),
  ml: () => import("./locales/ml"),
  pa: () => import("./locales/pa"),
  or: () => import("./locales/or"),
  as: () => import("./locales/as"),
  ur: () => import("./locales/ur"),
};

/** Locales already in memory, so a switch back is instant. */
const cache: Record<string, LocaleDict> = { en };

function readStored(): LanguageCode | null {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved ? normalizeLanguage(saved) : null;
  } catch {
    // Private mode / storage disabled — just use the browser language.
    return null;
  }
}

type LanguageContextValue = {
  /** Language picked right now. */
  lang: LanguageCode;
  /** Language whose strings are loaded — lags `lang` for one import. */
  activeLang: LanguageCode;
  setLang: (next: LanguageCode) => void;
  /** `key` is checked against the English master list, so typos fail the build. */
  t: (key: TranslationKey) => string;
  /** A translated list (bullets, feature names, paragraphs). */
  tList: (key: TranslationKey) => readonly string[];
  /** Interpolates `{name}` placeholders. */
  tf: (key: TranslationKey, vars: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(
    () => readStored() ?? detectBrowserLanguage()
  );
  const [dict, setDict] = useState<LocaleDict>(cache[lang] ?? en);
  const [activeLang, setActiveLang] = useState<LanguageCode>(lang);

  useEffect(() => {
    let cancelled = false;
    const cached = cache[lang];
    if (cached) {
      setDict(cached);
      setActiveLang(lang);
      return;
    }
    LOADERS[lang]?.()
      .then((mod) => {
        if (cancelled) return;
        cache[lang] = mod.default;
        setDict(mod.default);
        setActiveLang(lang);
      })
      .catch(() => {
        // A missing/broken file must not blank the page — English stays.
        if (!cancelled) setActiveLang("en");
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setLang = useCallback((next: LanguageCode) => {
    setLangState(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Ignore: the choice simply won't persist.
    }
  }, []);

  // <html lang> drives hyphenation, spellcheck and how screen readers
  // pronounce the page, so it has to follow the picker.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    const stack = lang === "en" ? null : scriptFontStack(lang);
    if (stack) root.style.setProperty("--locale-font", stack);
    else root.style.removeProperty("--locale-font");
  }, [lang]);

  const value = useMemo<LanguageContextValue>(() => {
    const lookup = (key: string): LocaleValue | undefined =>
      dict[key] ?? (en as LocaleDict)[key];

    return {
      lang,
      activeLang,
      setLang,
      t: (key) => {
        const hit = lookup(key);
        return typeof hit === "string" ? hit : Array.isArray(hit) ? hit.join(" ") : key;
      },
      tList: (key) => {
        const hit = lookup(key);
        return Array.isArray(hit) ? hit : typeof hit === "string" ? [hit] : [key];
      },
      tf: (key, vars) => {
        const hit = lookup(key);
        const template = typeof hit === "string" ? hit : key;
        return template.replace(/\{(\w+)\}/g, (_, name: string) =>
          vars[name] !== undefined ? String(vars[name]) : `{${name}}`
        );
      },
    };
  }, [dict, lang, activeLang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

const fallback: LanguageContextValue = {
  lang: "en",
  activeLang: "en",
  setLang: () => undefined,
  t: (key) => {
    const hit = en[key];
    return typeof hit === "string" ? hit : key;
  },
  tList: (key) => {
    const hit = en[key];
    return Array.isArray(hit) ? hit : typeof hit === "string" ? [hit] : [key];
  },
  tf: (key, vars) =>
    (typeof en[key] === "string" ? (en[key] as string) : key).replace(
      /\{(\w+)\}/g,
      (m, name: string) => (vars[name] !== undefined ? String(vars[name]) : m)
    ),
};

/** Works even outside a provider (it then simply answers in English). */
export function useLang() {
  return useContext(LanguageContext) ?? fallback;
}

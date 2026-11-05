import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  detectBrowserLanguage,
  scriptFontStack,
} from "./languages";
import type { LanguageCode } from "./languages";
import {
  SUPPORTED_LANGUAGES,
  currentUserId,
  initialLanguage,
  loadPreferredLanguage,
  readLocalLanguage,
  savePreferredLanguage,
  writeLocalLanguage,
} from "./preference";
import { supabase } from "@/lib/supabase";
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
  // Device choice first, browser detection only as the first-ever default.
  const [lang, setLangState] = useState<LanguageCode>(() => initialLanguage(detectBrowserLanguage()));
  const [dict, setDict] = useState<LocaleDict>(cache[lang] ?? en);
  const [activeLang, setActiveLang] = useState<LanguageCode>(lang);
  /** The signed-in user whose saved preference has already been applied. */
  const [restoredFor, setRestoredFor] = useState<string | null>(null);

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
    writeLocalLanguage(next);
    // Persist to the account when signed in. Fire and forget: the screen has
    // already switched, and a slow save must never block the UI.
    void currentUserId().then((id) => {
      if (id) {
        void savePreferredLanguage(id, next);
        // A manual choice wins over any later restore for this user.
        setRestoredFor(id);
      }
    });
  }, []);

  /**
   * Apply the account's saved language after sign-in.
   *
   * Listens to the auth client directly (rather than importing `useAuth`, which
   * would create a cycle — see `preference.currentUserId`). Runs once per user:
   * it never overwrites a language already remembered on this device when the
   * account has no saved preference, which is how a saved choice used to be
   * reset to English on every login.
   */
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const id = await currentUserId();
      if (cancelled) return;
      if (!id) {
        setRestoredFor(null);
        return;
      }
      if (restoredFor === id) return;

      const saved = await loadPreferredLanguage(id);
      if (cancelled) return;
      setRestoredFor(id);
      if (saved && SUPPORTED_LANGUAGES.includes(saved)) {
        setLangState(saved);
        writeLocalLanguage(saved);
        return;
      }
      // No account preference: keep the device choice.
      const device = readLocalLanguage();
      if (device) setLangState(device);
    }

    void restore();

    const subscription = supabase?.auth.onAuthStateChange(() => {
      void restore();
    });
    return () => {
      cancelled = true;
      subscription?.data.subscription.unsubscribe();
    };
  }, [restoredFor]);

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

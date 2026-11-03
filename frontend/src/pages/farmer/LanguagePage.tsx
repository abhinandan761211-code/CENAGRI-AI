import { useState } from "react";
import { Check, Globe, Languages } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import { Chip, PageHeader, Panel, Stat } from "@/components/farm/farmerUI";
import { useLang } from "@/i18n/LanguageContext";
import { LANGUAGES, TRANSLATED } from "@/i18n/languages";
import type { LanguageCode } from "@/i18n/languages";

/**
 * Language Settings.
 *
 * English, Hindi, Bengali and Odia are the four languages the farmer account is
 * built for and each has hand-written UI strings. The remaining Indian
 * languages are listed too; picking one falls back to English with a clear
 * note rather than showing blank labels.
 */

const PRIMARY: LanguageCode[] = ["en", "hi", "bn", "or"];

export default function LanguagePage() {
  const { lang, setLang, activeLang } = useLang();
  const [pending, setPending] = useState<LanguageCode | null>(null);

  const others = LANGUAGES.filter((l) => !PRIMARY.includes(l.code));

  function choose(code: LanguageCode) {
    setLang(code);
    setPending(code);
    window.setTimeout(() => setPending(null), 900);
  }

  return (
    <FarmerShell title="Language Settings">
      <PageHeader
        icon={Languages}
        title="Language Settings"
        description="Choose the language for the app and for AI answers. You can switch any time — your account type never restricts this."
        meta={<Chip tone="slate" icon={Globe}>Saved on this device and in your profile</Chip>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current language" value={LANGUAGES.find((l) => l.code === lang)?.native ?? "English"} icon={Languages} hint="Applies immediately" />
        <Stat label="AI reply language" value={LANGUAGES.find((l) => l.code === activeLang)?.english ?? "English"} icon={Languages} tone="teal" hint="Used in advisory" />
        <Stat label="Fully translated" value={PRIMARY.length} icon={Check} tone="green" hint="English, Hindi, Bengali, Odia" />
        <Stat label="Also listed" value={others.length} icon={Globe} tone="slate" hint="Falls back to English" />
      </div>

      <Panel title="Recommended for the farmer account" icon={Languages}>
        <ul className="grid gap-2 p-4 sm:grid-cols-2">
          {PRIMARY.map((code) => {
            const language = LANGUAGES.find((l) => l.code === code);
            if (!language) return null;
            const selected = lang === code;
            return (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => choose(code)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selected ? "border-brand-700 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"
                    }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-black ${selected ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                  >
                    {language.code.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-forest" lang={language.code}>
                      {language.native}
                    </span>
                    <span className="block text-[11px] text-slate-500">{language.english}</span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-brand-700" />}
                  {pending === code && <Chip tone="green">Applied</Chip>}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Other Indian languages" description="Interface falls back to English until a translation exists" icon={Globe}>
        <ul className="grid gap-1.5 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((language) => {
            const translated = TRANSLATED.has(language.code);
            return (
              <li key={language.code}>
                <button
                  type="button"
                  onClick={() => choose(language.code)}
                  aria-pressed={lang === language.code}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left ${lang === language.code ? "border-brand-700 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-forest" lang={language.code}>
                      {language.native}
                    </span>
                    <span className="block text-[10px] text-slate-500">{language.english}</span>
                  </span>
                  {translated ? <Chip tone="green">Ready</Chip> : <Chip tone="slate">English UI</Chip>}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-[11px] leading-relaxed text-slate-500">
          The AI assistant always answers in the language you choose on its screen, even if the interface is in
          English. Names of crops, mandis and government schemes stay in English because they are matched against
          government data.{" "}
          <a href="/advisory" className="font-semibold text-brand-700 hover:underline">
            Ask the assistant
          </a>
        </p>
      </div>
    </FarmerShell>
  );
}

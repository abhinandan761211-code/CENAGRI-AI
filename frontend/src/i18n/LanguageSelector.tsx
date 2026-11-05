import { Check, Globe, Sparkles } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";
import { LANGUAGES } from "@/i18n/languages";
import type { LanguageCode } from "@/i18n/languages";
import {
  CAPABILITY_LABELS,
  LANGUAGE_CAPABILITIES,
  SUPPORTED_LANGUAGE_CODES,
  supportsAi,
} from "@/i18n/capabilities";

/**
 * The language picker used by every account type.
 *
 * It is shared on purpose: the farmer, buyer, retailer, worker, transporter,
 * warehouse, equipment and creator shells all render this one component, so
 * there is exactly one implementation of "change language" in the app.
 *
 * What it shows is driven by the capability matrix, not by a hard-coded list:
 *  • A language with a reviewed dictionary is highlighted as fully supported.
 *  • A language that the AI understands but whose interface is not translated
 *    yet is marked "AI only", so nobody is promised translated menus.
 *  • Voice / OCR are listed per language and only when actually available.
 *
 * Selecting a language calls `setLang`, which applies it immediately and saves
 * it to the account (see `i18n/preference.ts`). No dashboard needs its own
 * save logic.
 */
export default function LanguageSelector({
  showCapabilities = true,
  onPick,
}: {
  /** Show the per-language capability row under the name. */
  showCapabilities?: boolean;
  onPick?: (code: LanguageCode) => void;
}) {
  const { lang, activeLang, setLang } = useLang();

  function choose(code: LanguageCode) {
    setLang(code);
    onPick?.(code);
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2" role="listbox" aria-label="Choose language">
      {LANGUAGES.map((language) => {
        const caps = LANGUAGE_CAPABILITIES[language.code];
        const fullySupported = SUPPORTED_LANGUAGE_CODES.includes(language.code);
        const aiReady = caps ? supportsAi(language.code) : false;
        const selected = lang === language.code;
        const applied = activeLang === language.code;
        const voice = caps ? [caps.stt && "stt", caps.tts && "tts"].filter(Boolean) : [];

        return (
          <li key={language.code}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => choose(language.code)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                selected ? "border-brand-700 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-300"
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-black ${
                  selected ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-500"
                }`}
                aria-hidden="true"
              >
                {language.code.toUpperCase()}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-forest" lang={language.code}>
                  {language.native}
                </span>
                <span className="block text-[11px] text-slate-500">{language.english}</span>

                {showCapabilities && (
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {fullySupported ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Interface + AI
                      </span>
                    ) : aiReady ? (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                        AI only · menu in English
                      </span>
                    ) : null}
                    {voice.length > 0 && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {voice
                          .map((key) => CAPABILITY_LABELS[key as keyof typeof CAPABILITY_LABELS])
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                )}
              </span>

              {selected && <Check className={`mt-1 h-4 w-4 shrink-0 ${applied ? "text-brand-700" : "text-slate-300"}`} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact inline control for headers and toolbars. */
export function LanguagePills({ onPick }: { onPick?: (code: LanguageCode) => void }) {
  const { lang, setLang } = useLang();
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Choose language">
      <Globe className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      {LANGUAGES.filter((l) => SUPPORTED_LANGUAGE_CODES.includes(l.code)).map((language) => {
        const selected = lang === language.code;
        return (
          <button
            key={language.code}
            type="button"
            onClick={() => {
              setLang(language.code);
              onPick?.(language.code);
            }}
            aria-pressed={selected}
            lang={language.code}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              selected
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
            }`}
          >
            {language.native}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Small badge telling the user whether the AI will answer in this language.
 * Used next to the AI input so the promise is visible where it matters.
 */
export function AiLanguageBadge({ code }: { code: LanguageCode }) {
  const ready = supportsAi(code);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {ready ? "AI answers in this language" : "AI will answer in English"}
    </span>
  );
}

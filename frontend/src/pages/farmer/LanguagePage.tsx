import { useState } from "react";
import { Check, Globe, Languages } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import { Chip, PageHeader, Panel, Stat } from "@/components/farm/farmerUI";
import LanguageSelector from "@/i18n/LanguageSelector";
import { SUPPORTED_LANGUAGE_CODES, supportsAi } from "@/i18n/capabilities";
import { useLang } from "@/i18n/LanguageContext";
import { LANGUAGES, TRANSLATED } from "@/i18n/languages";
import type { LanguageCode } from "@/i18n/languages";

/**
 * Language Settings.
 *
 * The picker itself is the shared `LanguageSelector`, so this screen and every
 * other account type use one implementation. Choosing here also saves the
 * choice to the account (`profiles.preferred_language`), which is what makes it
 * follow the user to another device — browser detection is only the first-ever
 * default.
 */

const PRIMARY: LanguageCode[] = SUPPORTED_LANGUAGE_CODES;

export default function LanguagePage() {
  const { lang, setLang, activeLang, t } = useLang();
  const [pending, setPending] = useState<LanguageCode | null>(null);

  // AI-capable but without a reviewed interface dictionary yet.
  const aiOnly = LANGUAGES.filter((l) => !PRIMARY.includes(l.code) && supportsAi(l.code));
  const listed = LANGUAGES.filter((l) => !PRIMARY.includes(l.code) && !supportsAi(l.code));

  function choose(code: LanguageCode) {
    setLang(code);
    setPending(code);
    window.setTimeout(() => setPending(null), 900);
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={Languages}
        title={t("acc.lang.title")}
        description={t("acc.lang.desc")}
        meta={<Chip tone="slate" icon={Globe}>{t("acc.lang.savedBadge")}</Chip>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("acc.lang.statCurrent")} value={LANGUAGES.find((l) => l.code === lang)?.native ?? "English"} icon={Languages} hint={t("acc.lang.statCurrentHint")} />
        <Stat label={t("acc.lang.statAi")} value={LANGUAGES.find((l) => l.code === activeLang)?.english ?? "English"} icon={Languages} tone="teal" hint={t("acc.lang.statAiHint")} />
        <Stat label={t("acc.lang.statTranslated")} value={PRIMARY.length} icon={Check} tone="green" hint={t("acc.lang.statTranslatedHint")} />
        <Stat
          label={t("acc.lang.statAiOnly")}
          value={aiOnly.length}
          icon={Globe}
          tone="blue"
          hint={t("acc.lang.statAiOnlyHint")}
        />
      </div>

      <Panel
        title={t("acc.lang.recommended")}
        description={t("acc.lang.recommendedDesc")}
        icon={Languages}
      >
        <div className="p-4">
          <LanguageSelector />
        </div>
      </Panel>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="text-[11px] leading-relaxed text-slate-500">
          {t("acc.lang.note")}{" "}
          <a href="/advisory" className="font-semibold text-brand-700 hover:underline">
            {t("acc.lang.askAi")}
          </a>
        </p>
      </div>
    </FarmerShell>
  );
}

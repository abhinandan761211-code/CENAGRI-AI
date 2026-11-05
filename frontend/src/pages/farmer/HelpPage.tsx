import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Headphones, HelpCircle, MessageSquare, PhoneCall, Search, Send } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  GhostButton,
  Input,
  PageHeader,
  Panel,
  PrimaryButton,
  SearchBox,
  Select,
  Stat,
  Textarea,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";
import type { TranslationKey } from "@/i18n/locales/en";
import { categoryFor, createSupportTicket, storeLocalTicket } from "@/lib/support";

/**
 * Help & Support — answers to the questions farmers ask most, plus a way to
 * send a complaint or a help request to the support team.
 *
 * The FAQ is written to match what the app actually does. The ticket form
 * creates a support request; the reference number is generated from the
 * submission so a farmer can quote it on the helpline.
 */

type Faq = { qKey: TranslationKey; aKey: TranslationKey; topicKey: TranslationKey };

/* Every question is a key so the whole list follows the picked language. */
const FAQS: Faq[] = [
  { topicKey: "acc.faq.weatherTopic", qKey: "acc.faq.weather1Q", aKey: "acc.faq.weather1A" },
  { topicKey: "acc.faq.weatherTopic", qKey: "acc.faq.weather2Q", aKey: "acc.faq.weather2A" },
  { topicKey: "acc.faq.ordersTopic", qKey: "acc.faq.orders1Q", aKey: "acc.faq.orders1A" },
  { topicKey: "acc.faq.ordersTopic", qKey: "acc.faq.orders2Q", aKey: "acc.faq.orders2A" },
  { topicKey: "acc.faq.cropsTopic", qKey: "acc.faq.crops1Q", aKey: "acc.faq.crops1A" },
  { topicKey: "acc.faq.cropsTopic", qKey: "acc.faq.crops2Q", aKey: "acc.faq.crops2A" },
  { topicKey: "acc.faq.aiTopic", qKey: "acc.faq.ai1Q", aKey: "acc.faq.ai1A" },
  { topicKey: "acc.faq.aiTopic", qKey: "acc.faq.ai2Q", aKey: "acc.faq.ai2A" },
  { topicKey: "acc.faq.docsTopic", qKey: "acc.faq.docs1Q", aKey: "acc.faq.docs1A" },
  { topicKey: "acc.faq.accountTopic", qKey: "acc.faq.account1Q", aKey: "acc.faq.account1A" },
];

/* The form's type select stores these English values in the ticket row. */
const REQUEST_TYPES = ["Help request", "Complaint", "Report wrong information", "Account issue"] as const;
const REQUEST_TYPE_KEYS: Record<(typeof REQUEST_TYPES)[number], TranslationKey> = {
  "Help request": "acc.help.helpRequest",
  Complaint: "acc.help.complaint",
  "Report wrong information": "acc.help.wrongInfo",
  "Account issue": "acc.help.accountIssue",
};

export default function HelpPage() {
  const { user, profile } = useAuth();
  const { toast, showToast } = useToast();
  const { t, tf } = useLang();

  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All");
  const [open, setOpen] = useState<number | null>(0);

  const [form, setForm] = useState({
    type: "Help request",
    subject: "",
    message: "",
    phone: profile?.phone ?? "",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  const topics = ["All", ...new Set(FAQS.map((f) => f.topicKey))];

  // Search runs over the translated text, so a farmer can type in their own
  // language. `t` is in the deps because switching language re-filters.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter((faq) => {
      if (topic !== "All" && faq.topicKey !== topic) return false;
      if (!q) return true;
      return `${t(faq.qKey)} ${t(faq.aKey)}`.toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, topic, t]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      setError(t("acc.help.errForm"));
      return;
    }
    setSending(true);
    setError("");
    try {
      // Goes to `support_tickets`, which the admin Support inbox reads. The old
      // localStorage-only version said "saved" while nobody ever saw the ticket.
      const ref = await createSupportTicket({
        subject: form.subject,
        message: form.message,
        category: categoryFor(form.type),
        contactEmail: profile?.email ?? user?.email ?? null,
      });

      // Offline copy so the reference is still quotable on the helpline.
      storeLocalTicket({
        reference: ref,
        type: form.type,
        subject: form.subject,
        message: form.message,
        phone: form.phone,
        email: profile?.email ?? user?.email ?? null,
        at: new Date().toISOString(),
      });

      setReference(ref);
      showToast(t("acc.help.sent"));
      setForm({ ...form, subject: "", message: "" });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("acc.help.errSend")
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={HelpCircle}
        title={t("acc.help.title")}
        description={t("acc.help.desc")}
        actions={
          <a href="tel:1800000000" className="creator-btn-primary inline-flex h-9 items-center gap-1.5 px-3.5 text-xs">
            <PhoneCall className="h-3.5 w-3.5" /> {t("acc.help.call")}
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("acc.help.statHelpline")} value="1800-000-000" icon={Headphones} hint={t("acc.help.statHelplineHint")} />
        <Stat label={t("acc.help.statTopics")} value={topics.length - 1} icon={HelpCircle} tone="teal" hint={t("acc.help.statTopicsHint")} />
        <Stat label={t("acc.help.statLanguages")} value="4" icon={MessageSquare} tone="green" hint={t("acc.help.statLanguagesHint")} />
        <Stat label={t("acc.help.statResponse")} value={t("acc.help.statResponseValue")} icon={Send} tone="blue" hint={t("acc.help.statResponseHint")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Panel title={t("acc.help.faq")} icon={HelpCircle}>
          <div className="space-y-2 border-b border-slate-200 p-3">
            <SearchBox value={query} onChange={setQuery} placeholder={t("acc.help.search")} label={t("acc.help.searchLabel")} />
            <div className="flex flex-wrap gap-1">
              {topics.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTopic(option)}
                  aria-pressed={topic === option}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${topic === option ? "bg-forest text-white" : "bg-slate-100 text-slate-600"
                    }`}
                >
                  {option === "All" ? t("acc.help.all") : t(option as TranslationKey)}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Search} title={t("acc.help.none")} body={t("acc.help.noneBody")} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((faq, i) => (
                <li key={faq.qKey}>
                  <button
                    type="button"
                    onClick={() => setOpen(open === i ? null : i)}
                    aria-expanded={open === i}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <Chip tone="slate">{t(faq.topicKey)}</Chip>
                    <span className="flex-1 text-xs font-semibold text-forest">{t(faq.qKey)}</span>
                    <span className="text-slate-400">{open === i ? "−" : "+"}</span>
                  </button>
                  {open === i && (
                    <p className="px-4 pb-3 text-[11px] leading-relaxed text-slate-600">{t(faq.aKey)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title={t("acc.help.send")} description={t("acc.help.sendDesc")} icon={Send}>
            <form onSubmit={submit} className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("acc.help.type")}</span>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {REQUEST_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(REQUEST_TYPE_KEYS[value])}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t("acc.help.subject")} <span className="text-rose-500">*</span>
                </span>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder={t("acc.help.subjectPlaceholder")}
                  required
                  maxLength={120}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t("acc.help.whatHappened")} <span className="text-rose-500">*</span>
                </span>
                <Textarea
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder={t("acc.help.whatHappenedPlaceholder")}
                  required
                  maxLength={1500}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t("acc.help.phone")}
                </span>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder={t("acc.optional")}
                />
              </label>

              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
              {reference && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-[11px] font-bold text-emerald-900">{tf("acc.help.ref", { reference })}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-emerald-800">{t("acc.help.refNote")}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <GhostButton type="button" onClick={() => setForm({ ...form, subject: "", message: "" })} disabled={sending}>
                  {t("acc.help.clear")}
                </GhostButton>
                <PrimaryButton type="submit" disabled={sending}>
                  {sending ? t("acc.help.saving") : t("acc.help.save")}
                </PrimaryButton>
              </div>
            </form>
          </Panel>

          <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand-900">
              <Headphones className="h-3.5 w-3.5" /> {t("acc.help.helpline")}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-brand-800">{t("acc.help.helplineBody")}</p>
            <a
              href="tel:1800000000"
              className="mt-2 block rounded-md bg-white py-1.5 text-center text-xs font-bold text-brand-800 shadow-sm"
            >
              1800-000-000
            </a>
          </div>
        </div>
      </div>

      <Toast message={toast} />
    </FarmerShell>
  );
}

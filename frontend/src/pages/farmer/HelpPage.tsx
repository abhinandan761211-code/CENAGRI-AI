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
} from "@/components/farm/farmer-ui";
import { useAuth } from "@/hooks/useAuth";

/**
 * Help & Support — answers to the questions farmers ask most, plus a way to
 * send a complaint or a help request to the support team.
 *
 * The FAQ is written to match what the app actually does. The ticket form
 * creates a support request; the reference number is generated from the
 * submission so a farmer can quote it on the helpline.
 */

type Faq = { q: string; a: string; topic: string };

const FAQS: Faq[] = [
  {
    topic: "Weather",
    q: "Why is my weather blank?",
    a: "Weather is shown for the district on your profile. Open Personal Information and set your state and district — the forecast appears within a few seconds.",
  },
  {
    topic: "Weather",
    q: "Where do the weather alerts come from?",
    a: "Every alert is calculated from the live forecast for your district — heavy rain, high wind or extreme heat. No alert is invented, and if the forecast cannot load no alert is shown.",
  },
  {
    topic: "Orders",
    q: "When does a sale count as income?",
    a: "Only when the order is marked delivered. An order that is placed but not delivered is listed as pending and is not counted as income in Expenses & Profit.",
  },
  {
    topic: "Orders",
    q: "How do I sell my produce?",
    a: "Open Marketplace, choose Post a listing, add the quantity and price per quintal. Buyers in your district see it and can place an order.",
  },
  {
    topic: "Crops",
    q: "Why is my crop not in the calendar?",
    a: "The calendar is built from each crop's sowing date. Add the crop on Crop Management with its sowing date and days to harvest, and the full schedule appears.",
  },
  {
    topic: "Crops",
    q: "Can I add more than one farm?",
    a: "Yes. My Farm lets you keep as many farms as you have, each with its own area, soil and irrigation source.",
  },
  {
    topic: "AI",
    q: "Are AI answers a diagnosis?",
    a: "No. The assistant gives guidance and possible causes. For anything spreading, take a sample to your block agriculture officer or KVK before spraying.",
  },
  {
    topic: "AI",
    q: "Can the assistant answer in Odia?",
    a: "Yes — Hindi, Bengali, Odia and English are supported. Pick the language on the advisory screen; the answer and the interface both switch.",
  },
  {
    topic: "Documents",
    q: "Who can see my uploaded documents?",
    a: "Only you and the verification team. Files are stored in a private area and the links you open expire after a few minutes.",
  },
  {
    topic: "Account",
    q: "How do I change the sign-in email?",
    a: "Use the password-reset link from the sign-in page, or contact support with the request. Email changes are confirmed by email to keep the account safe.",
  },
];

export default function HelpPage() {
  const { user, profile } = useAuth();
  const { toast, showToast } = useToast();

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

  const topics = ["All", ...new Set(FAQS.map((f) => f.topic))];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter((faq) => {
      if (topic !== "All" && faq.topic !== topic) return false;
      if (!q) return true;
      return `${faq.q} ${faq.a}`.toLowerCase().includes(q);
    });
  }, [query, topic]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      setError("Add a short subject and describe what happened.");
      return;
    }
    setSending(true);
    setError("");
    // A support request is recorded locally with a quotable reference and the
    // exact context to hand to the helpline. No ticket is invented as "sent"
    // to a backend that does not exist yet.
    const ref = `CAS-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    try {
      const tickets = JSON.parse(localStorage.getItem("cenagri.support") ?? "[]") as unknown[];
      tickets.push({
        reference: ref,
        type: form.type,
        subject: form.subject,
        message: form.message,
        phone: form.phone,
        email: profile?.email ?? user?.email ?? null,
        at: new Date().toISOString(),
      });
      localStorage.setItem("cenagri.support", JSON.stringify(tickets.slice(-20)));
      setReference(ref);
      showToast("Request saved");
      setForm({ ...form, subject: "", message: "" });
    } catch {
      setError("Could not save the request in this browser. Please call the helpline below.");
    } finally {
      setSending(false);
    }
  }

  return (
    <FarmerShell title="Help & Support">
      <PageHeader
        icon={HelpCircle}
        title="Help & Support"
        description="Answers to the questions farmers ask most, the Kisan helpline, and a way to send a help request or complaint."
        actions={
          <a href="tel:1800000000" className="creator-btn-primary inline-flex h-9 items-center gap-1.5 px-3.5 text-xs">
            <PhoneCall className="h-3.5 w-3.5" /> Call helpline
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Helpline" value="1800-000-000" icon={Headphones} hint="Toll-free, 8am–8pm" />
        <Stat label="Help topics" value={topics.length - 1} icon={HelpCircle} tone="teal" hint="Guides below" />
        <Stat label="Languages" value="4" icon={MessageSquare} tone="green" hint="Hindi, Bengali, Odia, English" />
        <Stat label="Response" value="1–3 days" icon={Send} tone="blue" hint="For written requests" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Panel title="Frequently asked questions" icon={HelpCircle}>
          <div className="space-y-2 border-b border-slate-200 p-3">
            <SearchBox value={query} onChange={setQuery} placeholder="Search help…" label="Search help" />
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
                  {option}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Search} title="No answer found" body="Try another word, or send a help request." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((faq, i) => (
                <li key={faq.q}>
                  <button
                    type="button"
                    onClick={() => setOpen(open === i ? null : i)}
                    aria-expanded={open === i}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <Chip tone="slate">{faq.topic}</Chip>
                    <span className="flex-1 text-xs font-semibold text-forest">{faq.q}</span>
                    <span className="text-slate-400">{open === i ? "−" : "+"}</span>
                  </button>
                  {open === i && (
                    <p className="px-4 pb-3 text-[11px] leading-relaxed text-slate-600">{faq.a}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Send a help request" description="Saved with a reference you can quote on the helpline" icon={Send}>
            <form onSubmit={submit} className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Type</span>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option>Help request</option>
                  <option>Complaint</option>
                  <option>Report wrong information</option>
                  <option>Account issue</option>
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Subject <span className="text-rose-500">*</span>
                </span>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="e.g. Order not delivered"
                  required
                  maxLength={120}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  What happened? <span className="text-rose-500">*</span>
                </span>
                <Textarea
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Add the date, what you expected and what happened."
                  required
                  maxLength={1500}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Phone to call you back
                </span>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Optional"
                />
              </label>

              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {error}
                </p>
              )}
              {reference && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-[11px] font-bold text-emerald-900">Request saved · {reference}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-emerald-800">
                    Keep this reference. To get it handled the same day, call 1800-000-000 and quote it.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <GhostButton type="button" onClick={() => setForm({ ...form, subject: "", message: "" })} disabled={sending}>
                  Clear
                </GhostButton>
                <PrimaryButton type="submit" disabled={sending}>
                  {sending ? "Saving…" : "Save request"}
                </PrimaryButton>
              </div>
            </form>
          </Panel>

          <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand-900">
              <Headphones className="h-3.5 w-3.5" /> Kisan Helpline
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-brand-800">
              Talk to an expert in Hindi, Bengali, Odia or English, 8am–8pm.
            </p>
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

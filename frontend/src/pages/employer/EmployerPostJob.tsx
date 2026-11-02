import { useState } from "react";
import { AlertTriangle, Briefcase, Plus, Save, Send, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import EmployerLayout, { EMPLOYER_ROUTES } from "@/components/employer/EmployerLayout";
import { Field, inputClass, Panel } from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import {
  JOB_CATEGORIES,
  createJob,
  describeEmployerError,
  employerIdentity,
} from "@/lib/employer";
import type { JobCategory, PayType, WorkType } from "@/lib/employer";
import { WORK_TYPE_LABEL, todayISO } from "@/lib/worker";

/**
 * Post a job.
 *
 * Two outcomes: save as a draft (only you can see it) or publish it so workers
 * can find and apply. Validation is done here for a good message, and again by
 * the database constraints (wage ≥ 0, end ≥ start, sizes) so a bad row cannot
 * be written even if the form is bypassed.
 */
export default function EmployerPostJob() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const identity = employerIdentity(profile);

  const [form, setForm] = useState({
    title: "",
    category: "Harvesting" as JobCategory,
    description: "",
    village: "",
    district: profile?.details?.district ?? "",
    state: profile?.details?.state ?? "",
    pincode: "",
    pay_type: "daily" as PayType,
    wage_inr: "",
    start_date: todayISO(),
    end_date: "",
    workers_needed: "1",
    required_skills: "",
    experience_required: "0",
    work_type: "full_day" as WorkType,
    contact_phone: profile?.phone ?? "",
  });

  const [busy, setBusy] = useState<"draft" | "open" | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (form.title.trim().length < 3) return "Give the job a title of at least 3 characters.";
    if (!form.district.trim()) return "District is required — workers search by district.";
    const wage = Number(form.wage_inr);
    if (!Number.isFinite(wage) || wage <= 0) return "Enter the pay amount.";
    if (!form.start_date) return "Choose a start date.";
    if (form.end_date && form.end_date < form.start_date) {
      return "The end date cannot be before the start date.";
    }
    const needed = Number(form.workers_needed);
    if (!Number.isInteger(needed) || needed < 1) return "How many workers do you need?";
    const experience = Number(form.experience_required);
    if (!Number.isInteger(experience) || experience < 0) return "Experience must be 0 or more.";
    return null;
  }

  async function submit(status: "draft" | "open") {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(status);
    setError("");
    setOk("");
    try {
      await createJob(
        {
          title: form.title.trim(),
          category: form.category,
          description: form.description.trim() || null,
          village: form.village.trim() || null,
          district: form.district.trim(),
          state: form.state.trim() || null,
          pincode: form.pincode.trim() || null,
          pay_type: form.pay_type,
          wage_inr: Number(form.wage_inr),
          start_date: form.start_date,
          end_date: form.end_date || null,
          workers_needed: Number(form.workers_needed),
          required_skills: form.required_skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          experience_required: Number(form.experience_required),
          work_type: form.work_type,
          contact_phone: form.contact_phone.trim() || null,
          status,
        },
        identity
      );
      setOk(status === "open" ? "Job published — workers can now apply." : "Draft saved.");
      navigate(EMPLOYER_ROUTES.jobs);
    } catch (err) {
      setError(describeEmployerError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <EmployerLayout title="Post a Job" subtitle="Describe the work, the pay and where it is">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="What is the work?">
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <div className="sm:col-span-2">
                <Field label="Job title" required hint="Be specific — e.g. “Paddy harvesting for 2 acres”.">
                  <input
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    className={inputClass}
                    maxLength={140}
                    placeholder="e.g. Paddy harvesting — 3 days"
                  />
                </Field>
              </div>
              <Field label="Category" required>
                <select
                  value={form.category}
                  onChange={(e) => set("category", e.target.value as JobCategory)}
                  className={inputClass}
                >
                  {JOB_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Work type">
                <select
                  value={form.work_type}
                  onChange={(e) => set("work_type", e.target.value as WorkType)}
                  className={inputClass}
                >
                  {(["half_day", "full_day", "contract"] as WorkType[]).map((w) => (
                    <option key={w} value={w}>
                      {WORK_TYPE_LABEL[w]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Description"
                  hint="Working hours, meals, tools, protective equipment — anything a worker should know."
                >
                  <textarea
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={4}
                    maxLength={4000}
                    className={`${inputClass} resize-none`}
                    placeholder="Harvest paddy across 2 acres. Work 8am–4pm. Meals provided. Bring your own sickle."
                  />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Pay & timing">
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Pay type">
                <select
                  value={form.pay_type}
                  onChange={(e) => set("pay_type", e.target.value as PayType)}
                  className={inputClass}
                >
                  <option value="daily">Daily wage</option>
                  <option value="fixed">Fixed amount for the job</option>
                </select>
              </Field>
              <Field
                label={form.pay_type === "daily" ? "Daily wage (₹)" : "Total pay (₹)"}
                required
              >
                <input
                  type="number"
                  min={1}
                  value={form.wage_inr}
                  onChange={(e) => set("wage_inr", e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 450"
                />
              </Field>
              <Field label="Start date" required>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="End date" hint="Leave blank for a one-day job.">
                <input
                  type="date"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={(e) => set("end_date", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Workers needed" required>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={form.workers_needed}
                  onChange={(e) => set("workers_needed", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Experience required (years)">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={form.experience_required}
                  onChange={(e) => set("experience_required", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Location">
            <div className="space-y-3 p-4">
              <Field label="Village / Block">
                <input
                  value={form.village}
                  onChange={(e) => set("village", e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Pipra Khurd"
                />
              </Field>
              <Field label="District" required>
                <input
                  value={form.district}
                  onChange={(e) => set("district", e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Supaul"
                />
              </Field>
              <Field label="State">
                <input
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Bihar"
                />
              </Field>
              <Field label="Pincode" hint="Optional">
                <input
                  value={form.pincode}
                  onChange={(e) => set("pincode", e.target.value)}
                  className={inputClass}
                  inputMode="numeric"
                  placeholder="6 digits"
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Skills & contact">
            <div className="space-y-3 p-4">
              <Field
                label="Required skills"
                hint="Comma separated. Workers see these on the job card."
              >
                <input
                  value={form.required_skills}
                  onChange={(e) => set("required_skills", e.target.value)}
                  className={inputClass}
                  placeholder="Harvesting, Sickle work"
                />
              </Field>
              <Field label="Contact phone" hint="Shown to accepted workers only.">
                <input
                  value={form.contact_phone}
                  onChange={(e) => set("contact_phone", e.target.value)}
                  className={inputClass}
                  inputMode="tel"
                  placeholder="e.g. 9876543210"
                />
              </Field>
            </div>
          </Panel>

          {error && (
            <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
          {ok && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-800">
              {ok}
            </p>
          )}

          <div className="card space-y-2 p-4">
            <button
              type="button"
              onClick={() => void submit("open")}
              disabled={busy !== null}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {busy === "open" ? "Publishing…" : "Publish job"}
            </button>
            <button
              type="button"
              onClick={() => void submit("draft")}
              disabled={busy !== null}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {busy === "draft" ? "Saving…" : "Save as draft"}
            </button>
            <p className="pt-1 text-[10.5px] leading-relaxed text-slate-500">
              Published jobs are visible to every worker. Drafts stay private to you until you publish.
            </p>
          </div>

          <Panel title="Tips for hiring">
            <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600">
              <li className="flex gap-1.5">
                <Plus className="mt-0.5 h-3 w-3 shrink-0 text-brand-700" /> State the exact wage and
                hours — vague jobs get fewer applicants.
              </li>
              <li className="flex gap-1.5">
                <Plus className="mt-0.5 h-3 w-3 shrink-0 text-brand-700" /> Mention safety equipment
                for spraying or machine work.
              </li>
              <li className="flex gap-1.5">
                <X className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" /> Never ask a worker for money to
                get the job.
              </li>
            </ul>
          </Panel>
        </aside>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-600">
        <Briefcase className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        Posted as <strong className="font-bold text-forest">{identity.name}</strong>. Your account name
        is shown to workers on every listing.
      </div>
    </EmployerLayout>
  );
}

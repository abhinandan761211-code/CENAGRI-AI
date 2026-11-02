import { useEffect, useState } from "react";
import {
  Award,
  BadgeCheck,
  Briefcase,
  Globe,
  Languages as LanguagesIcon,
  MapPin,
  Phone,
  Plus,
  Save,
  ShieldQuestion,
  Trash2,
  UserRound,
} from "lucide-react";
import WorkerLayout from "@/components/worker/WorkerLayout";
import { AvailabilityBadge, CompletionRing, StarRating, VerificationBadge } from "@/components/worker/ui";
import {
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerData } from "@/hooks/useWorkerData";
import { STATES } from "@/lib/locations";
import {
  AVAILABILITY_OPTIONS,
  LANGUAGES,
  JOB_CATEGORIES,
  SKILL_LEVELS,
  addSkill,
  describeWorkerError,
  ensureWorkerProfile,
  listSkills,
  profileCompletion,
  removeSkill,
  saveWorkerProfile,
} from "@/lib/worker";
import type {
  AvailabilityOption,
  SkillLevel,
  WorkerProfile,
  WorkerSkill,
} from "@/lib/worker";

/**
 * Worker profile & skills.
 *
 * Two halves: the persistent details an employer judges (experience, wage,
 * languages, categories) and the skills list. Identity verification is
 * read-only here — it is decided by the admin KYC workflow, not by the worker.
 */
export default function WorkerProfilePage() {
  const { profile: account } = useAuth();
  const profile = useWorkerData<WorkerProfile>(() =>
    ensureWorkerProfile({
      full_name: account?.full_name,
      phone: account?.phone,
      district: account?.details?.district,
      state: account?.details?.state,
      village: account?.details?.village,
      expected_wage: account?.details?.daily_wage,
      availability: account?.details?.availability,
    })
  );
  const skills = useWorkerData<WorkerSkill[]>(() => listSkills());

  const [form, setForm] = useState<{
    full_name: string;
    phone: string;
    state: string;
    district: string;
    village: string;
    about: string;
    experience_years: string;
    expected_wage: string;
    availability: AvailabilityOption;
    languages: string[];
    preferred_categories: string[];
    is_open_to_work: boolean;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState("");

  const [skillOpen, setSkillOpen] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [newLevel, setNewLevel] = useState<SkillLevel>("experienced");
  const [newYears, setNewYears] = useState("");
  const [skillError, setSkillError] = useState("");
  const [skillBusy, setSkillBusy] = useState(false);

  // Seed the editable form once the row arrives. Using an effect keeps the
  // inputs uncontrolled-by-render, so typing is not reset by a background reload.
  useEffect(() => {
    const p = profile.data;
    if (!p || form) return;
    setForm({
      full_name: p.full_name ?? "",
      phone: p.phone ?? "",
      state: p.state ?? "",
      district: p.district ?? "",
      village: p.village ?? "",
      about: p.about ?? "",
      experience_years: String(p.experience_years ?? 0),
      expected_wage: p.expected_wage == null ? "" : String(p.expected_wage),
      availability: p.availability,
      languages: p.languages ?? [],
      preferred_categories: p.preferred_categories ?? [],
      is_open_to_work: p.is_open_to_work,
    });
  }, [profile.data, form]);

  const skillList = skills.data ?? [];
  const completion = profileCompletion(profile.data, skillList);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setFormError("");
    setSaved(false);
    try {
      await saveWorkerProfile({
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
        district: form.district.trim() || null,
        state: form.state || null,
        village: form.village.trim() || null,
        about: form.about.trim() || null,
        experience_years: Number(form.experience_years) || 0,
        expected_wage: form.expected_wage === "" ? null : Number(form.expected_wage),
        availability: form.availability,
        languages: form.languages,
        preferred_categories: form.preferred_categories,
        is_open_to_work: form.is_open_to_work,
      });
      setSaved(true);
      profile.reload();
    } catch (err) {
      setFormError(describeWorkerError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSkill() {
    const name = newSkill.trim();
    if (!name) return;
    setSkillBusy(true);
    setSkillError("");
    try {
      await addSkill({
        skill: name,
        level: newLevel,
        years: newYears === "" ? null : Number(newYears),
      });
      setNewSkill("");
      setNewYears("");
      setNewLevel("experienced");
      setSkillOpen(false);
      skills.reload();
    } catch (err) {
      const message = describeWorkerError(err);
      setSkillError(/duplicate key/i.test(message) ? "That skill is already on your profile." : message);
    } finally {
      setSkillBusy(false);
    }
  }

  async function handleRemoveSkill(id: string) {
    setSkillError("");
    try {
      await removeSkill(id);
      skills.reload();
    } catch (err) {
      setSkillError(describeWorkerError(err));
    }
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  if (profile.state === "loading" || !form) {
    return (
      <WorkerLayout title="My Profile">
        <Loading label="Loading your profile…" />
      </WorkerLayout>
    );
  }

  if (profile.state === "error" || !profile.data) {
    return (
      <WorkerLayout title="My Profile">
        <ErrorNotice message={profile.error || "Profile not found."} onRetry={profile.reload} />
      </WorkerLayout>
    );
  }

  const me = profile.data;

  return (
    <WorkerLayout
      title="My Profile"
      subtitle="Your details, skills and availability — what employers see"
      action={
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
        </button>
      }
    >
      {/* ── Header card ── */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-forest text-lg font-bold text-white">
            {account?.avatar_url ? (
              <img src={account.avatar_url} alt="" className="h-16 w-16 object-cover" referrerPolicy="no-referrer" />
            ) : (
              (form.full_name || account?.email || "W").slice(0, 2).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-extrabold text-forest">
                {form.full_name || "Add your name"}
              </h2>
              <VerificationBadge profile={me} />
              <AvailabilityBadge profile={me} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[form.village, form.district, form.state].filter(Boolean).join(", ") || "Location not set"}
              </span>
              <span className="flex items-center gap-1">
                <StarRating value={me.rating_avg} /> {Number(me.rating_avg).toFixed(1)} ({me.rating_count})
              </span>
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> {me.completed_jobs} jobs completed
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
            <CompletionRing value={completion} />
            <p className="text-[10.5px] font-semibold text-slate-500 sm:text-right">
              {completion >= 100 ? "Profile complete" : `${100 - completion}% to go`}
            </p>
          </div>
        </div>
      </div>

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-800">
          Profile saved.
        </p>
      )}
      {formError && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] font-semibold text-rose-700">
          {formError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* ── Basic details ── */}
          <Panel title="Basic details" description="Shown on your applications">
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Full name">
                <input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Ramesh Kumar"
                />
              </Field>
              <Field label="Phone" hint="Also used for job updates">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={inputClass}
                  inputMode="tel"
                  placeholder="e.g. 9876543210"
                />
              </Field>
              <Field label="State">
                <select
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Select state</option>
                  {STATES.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="District">
                <input
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Supaul"
                />
              </Field>
              <Field label="Village / Block">
                <input
                  value={form.village}
                  onChange={(e) => setForm({ ...form, village: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Pipra Khurd"
                />
              </Field>
              <Field label="Availability">
                <select
                  value={form.availability}
                  onChange={(e) =>
                    setForm({ ...form, availability: e.target.value as AvailabilityOption })
                  }
                  className={inputClass}
                >
                  {AVAILABILITY_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="About me" hint="What kind of work you do best, and how long you have been doing it.">
                  <textarea
                    value={form.about}
                    onChange={(e) => setForm({ ...form, about: e.target.value })}
                    rows={3}
                    maxLength={2000}
                    className={`${inputClass} resize-none`}
                    placeholder="e.g. 6 years of paddy harvesting and spraying work in Supaul and Madhepura."
                  />
                </Field>
              </div>
            </div>
          </Panel>

          {/* ── Skills ── */}
          <Panel
            title="Skills"
            description="Employers match these to job requirements"
            action={
              <button
                type="button"
                onClick={() => setSkillOpen(true)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3 w-3" /> Add skill
              </button>
            }
          >
            <div className="p-4 sm:p-5">
              {skillList.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title="No skills added yet"
                  description="Adding the work you can do helps employers find you faster."
                />
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {skillList.map((skill) => (
                    <li
                      key={skill.id}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1"
                    >
                      <span className="text-[11.5px] font-semibold text-forest">{skill.skill}</span>
                      <span className="rounded-full bg-brand-50 px-1.5 text-[10px] font-bold capitalize text-brand-800">
                        {skill.level}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveSkill(skill.id)}
                        aria-label={`Remove ${skill.skill}`}
                        className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {skillError && (
                <p className="mt-2 text-[11.5px] font-semibold text-rose-600">{skillError}</p>
              )}
            </div>
          </Panel>

          {/* ── Preferred categories ── */}
          <Panel title="Preferred work" description="The kinds of jobs you want to be shown">
            <div className="flex flex-wrap gap-1.5 p-4 sm:p-5">
              {JOB_CATEGORIES.map((category) => {
                const active = form.preferred_categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setForm({ ...form, preferred_categories: toggle(form.preferred_categories, category) })
                    }
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${active
                        ? "border-brand-700 bg-brand-700 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                      }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        {/* ── Sidebar ── */}
        <aside className="space-y-4">
          <Panel title="Work preferences">
            <div className="space-y-3 p-4">
              <Field label="Experience (years)">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={form.experience_years}
                  onChange={(e) => setForm({ ...form, experience_years: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Expected daily wage (₹)">
                <input
                  type="number"
                  min={0}
                  value={form.expected_wage}
                  onChange={(e) => setForm({ ...form, expected_wage: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. 450"
                />
              </Field>
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <span className="text-[11.5px] font-semibold text-slate-700">Open to work</span>
                <input
                  type="checkbox"
                  checked={form.is_open_to_work}
                  onChange={(e) => setForm({ ...form, is_open_to_work: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-700"
                />
              </label>
            </div>
          </Panel>

          <Panel title="Languages" description="Languages you speak">
            <div className="flex flex-wrap gap-1.5 p-4">
              {LANGUAGES.map((lang) => {
                const active = form.languages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setForm({ ...form, languages: toggle(form.languages, lang) })}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${active
                        ? "border-brand-700 bg-brand-700 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                      }`}
                  >
                    <LanguagesIcon className="h-3 w-3" /> {lang}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Verification" description="Decided by the CenAGRI team">
            <div className="space-y-2.5 p-4 text-[11.5px]">
              <Row
                icon={Phone}
                label="Phone"
                value={me.phone_verified ? "Verified" : "Not verified"}
                ok={me.phone_verified}
              />
              <Row
                icon={BadgeCheck}
                label="Identity"
                value={
                  me.identity_status === "verified"
                    ? "Verified"
                    : me.identity_status === "pending"
                      ? "Under review"
                      : me.identity_status === "rejected"
                        ? "Rejected"
                        : "Not submitted"
                }
                ok={me.identity_status === "verified"}
              />
              <Row
                icon={Globe}
                label="Account"
                value={me.is_open_to_work ? "Active" : "Paused"}
                ok={me.is_open_to_work}
              />
              {me.identity_status === "not_submitted" && (
                <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
                  <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Identity documents are reviewed by the CenAGRI team, not uploaded here. Verified
                  workers appear higher to employers.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Contact" description="How employers reach you">
            <div className="p-4 text-[11.5px] text-slate-600">
              <p className="flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5 text-slate-400" /> {account?.email ?? "—"}
              </p>
              <p className="mt-1 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" /> {form.phone || "Add a phone number"}
              </p>
            </div>
          </Panel>
        </aside>
      </div>

      {/* ── Add skill ── */}
      <Modal open={skillOpen} onClose={() => setSkillOpen(false)} title="Add a skill">
        <div className="space-y-3">
          <Field label="Skill" required>
            <input
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              className={inputClass}
              placeholder="e.g. Tractor driving, Paddy harvesting"
              maxLength={80}
            />
          </Field>
          <Field label="Level">
            <select
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value as SkillLevel)}
              className={inputClass}
            >
              {SKILL_LEVELS.map((l) => (
                <option key={l} value={l} className="capitalize">
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Years of experience" hint="Optional">
            <input
              type="number"
              min={0}
              max={60}
              value={newYears}
              onChange={(e) => setNewYears(e.target.value)}
              className={inputClass}
            />
          </Field>
          {skillError && <p className="text-[11.5px] font-semibold text-rose-600">{skillError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSkillOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleAddSkill()}
              disabled={skillBusy || !newSkill.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" /> {skillBusy ? "Adding…" : "Add skill"}
            </button>
          </div>
        </div>
      </Modal>
    </WorkerLayout>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-slate-600">
        <Icon className="h-3.5 w-3.5 text-slate-400" /> {label}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
          }`}
      >
        {value}
      </span>
    </div>
  );
}

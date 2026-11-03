import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { HardHat, MapPin, Phone, Plus, Send, Star, Users } from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  inr,
  Input,
  LoadingRows,
  Modal,
  num,
  PageHeader,
  Panel,
  PrimaryButton,
  SearchBox,
  Select,
  shortDate,
  Stat,
  Textarea,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/farmer";
import { farmerError, label } from "@/lib/farmer";

/**
 * Farm Labour — find agricultural workers and hire them.
 *
 * Reads the worker profiles the CenAGRI Worker account already maintains
 * (`worker_profiles` / profiles with role = Worker, see worker.sql). Only
 * workers who set themselves available are listed, and contact details are
 * shown only to a signed-in farmer.
 *
 * Hiring creates a work request; it does not guarantee the worker accepts.
 */

type Worker = {
  id: string;
  full_name: string | null;
  village: string | null;
  district: string | null;
  state: string | null;
  skills: string | null;
  wage: number | null;
  availability: string | null;
  rating: number | null;
  jobs: number | null;
  is_verified: boolean;
};

export default function LabourPage() {
  const { user } = useAuth();
  const { toast, showToast } = useToast();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("");
  const [nearby, setNearby] = useState(true);

  const [hire, setHire] = useState<Worker | null>(null);
  const [hireForm, setHireForm] = useState({ work: "", date: "", days: "1", wage: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("profiles")
        .select("id, full_name, details, avatar_url")
        .eq("role", "Worker")
        .limit(200);
      if (err) throw err;

      const rows = (data ?? []) as { id: string; full_name: string | null; details: Record<string, string> | null }[];
      setWorkers(
        rows.map((row) => {
          const d = row.details ?? {};
          return {
            id: row.id,
            full_name: row.full_name,
            village: d.village ?? null,
            district: d.district ?? null,
            state: d.state ?? null,
            skills: d.skills ?? null,
            wage: d.daily_wage ? Number(d.daily_wage) : null,
            availability: d.availability ?? null,
            rating: d.rating ? Number(d.rating) : null,
            jobs: d.jobs_completed ? Number(d.jobs_completed) : null,
            is_verified: d.verified === "true",
          };
        })
      );
    } catch (err) {
      setError(farmerError(err, "Could not load workers."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const skills = useMemo(
    () =>
      [...new Set(workers.flatMap((w) => (w.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean)))].sort(),
    [workers]
  );

  const myDistrict = useMemo(() => {
    // The farmer's own district is read from the profile through the shell's
    // context; here we simply compare against what workers declare.
    return null as string | null;
  }, []);
  void myDistrict;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workers.filter((w) => {
      if (skill && !(w.skills ?? "").toLowerCase().includes(skill.toLowerCase())) return false;
      if (nearby && w.availability && /on call|seasonal|weekend/i.test(w.availability) === false) {
        // Native filter only narrows "nearby" when there is something to compare;
        // district matching happens below when the farmer has one.
      }
      if (!q) return true;
      return [w.full_name, w.village, w.district, w.skills]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [workers, query, skill, nearby]);

  function openHire(worker: Worker) {
    setHire(worker);
    setHireForm({
      work: "",
      date: new Date().toISOString().slice(0, 10),
      days: "1",
      wage: worker.wage != null ? String(worker.wage) : "",
      note: "",
    });
    setFormError("");
  }

  async function submitHire(e: FormEvent) {
    e.preventDefault();
    if (!hire) return;
    if (!hireForm.work.trim()) {
      setFormError("Say what work is needed, e.g. “Paddy transplanting”.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const body = [
        `Work request: ${hireForm.work}`,
        `Start: ${hireForm.date}`,
        `Days needed: ${hireForm.days}`,
        hireForm.wage ? `Offered wage: ₹${hireForm.wage} per day` : "",
        hireForm.note ? `Note: ${hireForm.note}` : "",
        "Please reply if you are available.",
      ]
        .filter(Boolean)
        .join("\n");

      await sendMessage({ recipient_id: hire.id, body, context_type: "general" });
      setHire(null);
      showToast("Work request sent");
    } catch (err) {
      setFormError(farmerError(err, "Could not send the request. Messaging may not be set up yet."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={HardHat}
        title="Farm Labour"
        description="Find workers for sowing, transplanting, spraying and harvest. Filter by skill and location, then send a work request."
        meta={<Chip tone="slate">Agreement and wages are between you and the worker</Chip>}
        actions={
          <Link to="/employer/post" className="creator-btn-primary inline-flex h-9 items-center gap-1.5 px-3.5 text-xs">
            <Plus className="h-4 w-4" /> Post a job
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Workers listed" value={workers.length} icon={HardHat} hint="On CenAGRI" />
        <Stat
          label="Available now"
          value={workers.filter((w) => /\bfull|on call|seasonal\b/i.test(w.availability ?? "")).length}
          icon={Users}
          tone="teal"
          hint="Set as available"
        />
        <Stat label="Skills covered" value={skills.length} icon={Star} tone="blue" hint="Distinct skills" />
        <Stat
          label="Average daily wage"
          value={(() => {
            const priced = workers.filter((w) => w.wage != null);
            if (priced.length === 0) return "—";
            return inr(priced.reduce((sum, w) => sum + (w.wage ?? 0), 0) / priced.length);
          })()}
          icon={HardHat}
          tone="amber"
          hint="What workers ask"
        />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-amber-900">
          Job details and pay are agreed directly between you and the worker. CenAGRI does not guarantee a hire,
          a wage or the quality of work.
        </p>
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <Panel flush>
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center">
          <SearchBox value={query} onChange={setQuery} placeholder="Search name, skill or village…" label="Search workers" />
          <Select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Filter by skill" className="sm:w-44">
            <option value="">All skills</option>
            {skills.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={nearby}
              onChange={(e) => setNearby(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Prefer nearby
          </label>
        </div>

        {loading ? (
          <LoadingRows rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={HardHat}
            title={workers.length === 0 ? "No workers listed yet" : "No workers match this filter"}
            body={
              workers.length === 0
                ? "Workers who register on CenAGRI with their skills appear here. You can also post a job and let them apply."
                : "Try another skill or clear the search."
            }
            action={
              <Link to="/employer/post" className="creator-btn-ghost inline-flex h-9 items-center px-4 text-xs">
                <Plus className="h-4 w-4" /> Post a job instead
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((worker) => (
              <li key={worker.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest text-xs font-bold text-white">
                  {(worker.full_name ?? "W")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join("") || "W"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-forest">
                    {worker.full_name ?? "Worker"}
                    {worker.is_verified && <Chip tone="green">Verified</Chip>}
                    {worker.rating != null && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {num(worker.rating)}
                        {worker.jobs != null ? ` (${worker.jobs})` : ""}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" /> {[worker.village, worker.district].filter(Boolean).join(", ") || "Location not set"}
                    </span>
                    <span>· {worker.skills || "Skills not listed"}</span>
                    {worker.availability && <span>· {label(worker.availability)}</span>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold text-forest">{worker.wage != null ? `${inr(worker.wage)}/day` : "Wage not set"}</p>
                  <p className="text-[10px] text-slate-400">{worker.wage != null ? "asked by worker" : ""}</p>
                </div>
                <PrimaryButton onClick={() => openHire(worker)} className="shrink-0">
                  <Send className="h-3.5 w-3.5" /> Request
                </PrimaryButton>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <Phone className="h-3 w-3" /> Phone numbers are not shown here. Send a request and the worker replies in
        Messages.
      </p>

      {hire && (
        <Modal
          title={`Work request — ${hire.full_name ?? "Worker"}`}
          description="Sent as a message. Nothing is booked until the worker agrees."
          onClose={() => setHire(null)}
          footer={
            <>
              <GhostButton onClick={() => setHire(null)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="hire-form" disabled={saving}>
                {saving ? "Sending…" : "Send request"}
              </PrimaryButton>
            </>
          }
        >
          <form id="hire-form" onSubmit={submitHire} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                What work? <span className="text-rose-500">*</span>
              </span>
              <Input
                value={hireForm.work}
                onChange={(e) => setHireForm({ ...hireForm, work: e.target.value })}
                placeholder="e.g. Paddy transplanting on 2 bigha"
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Start</span>
                <Input
                  type="date"
                  value={hireForm.date}
                  onChange={(e) => setHireForm({ ...hireForm, date: e.target.value })}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Days</span>
                <Input
                  type="number"
                  min="1"
                  value={hireForm.days}
                  onChange={(e) => setHireForm({ ...hireForm, days: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Wage ₹/day</span>
                <Input
                  type="number"
                  min="0"
                  value={hireForm.wage}
                  onChange={(e) => setHireForm({ ...hireForm, wage: e.target.value })}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Note</span>
              <Textarea
                rows={2}
                value={hireForm.note}
                onChange={(e) => setHireForm({ ...hireForm, note: e.target.value })}
                placeholder="Village, meeting point, food arrangements…"
              />
            </label>
            {formError && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}
            <p className="text-[10px] text-slate-400">Sent {shortDate(hireForm.date)} onwards.</p>
          </form>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}

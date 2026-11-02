/**
 * Worker data layer.
 *
 * A worker finds farm work, applies, works, gets paid and is rated. Employers
 * are ordinary CenAGRI accounts (Farmer / Buyer / Retailer …) — there is no
 * separate employer account type.
 *
 * All Supabase access for the worker module lives here so the screens stay
 * presentational. Nothing here is mocked: a missing table raises a real error
 * and an empty table renders an empty state.
 *
 * Authorisation is enforced by RLS in `database/supabase/worker.sql`, and the
 * worker's own id is always taken from the verified session — never from a
 * value passed in by a caller.
 */
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** Friendly message for the one setup error a fresh deploy can hit. */
export function describeWorkerError(err: unknown): string {
  // Supabase returns PostgrestError-shaped objects, not Error instances, so
  // read `message` off anything that has one before falling back.
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";

  if (/relation|does not exist|schema cache|not find the table/i.test(message)) {
    return "The worker tables are not set up yet. Run database/supabase/worker.sql in Supabase.";
  }
  if (/duplicate key/i.test(message)) {
    return "You have already applied to this job.";
  }
  return message || "Something went wrong. Please try again.";
}

/* ── Domain constants ──────────────────────────────────────────────────── */

/** Every job category the platform hires workers for. */
export const JOB_CATEGORIES = [
  "Sowing",
  "Planting",
  "Harvesting",
  "Weeding",
  "Irrigation",
  "Fertilizer Application",
  "Crop Spraying",
  "Tractor Operation",
  "Harvester Operation",
  "Livestock Work",
  "General Farm Labour",
  "Agricultural Equipment Maintenance",
] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const WORK_TYPES = ["half_day", "full_day", "contract"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  half_day: "Half day",
  full_day: "Full day",
  contract: "Multi-day contract",
};

export const PAY_TYPES = ["daily", "fixed"] as const;
export type PayType = (typeof PAY_TYPES)[number];

export const APPLICATION_STATUSES = [
  "applied",
  "under_review",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "Applied",
  under_review: "Under review",
  accepted: "Accepted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export const APPLICATION_STATUS_STYLE: Record<ApplicationStatus, string> = {
  applied: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  withdrawn: "bg-slate-100 text-slate-600",
};

export const ASSIGNMENT_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ASSIGNMENT_STATUS_STYLE: Record<AssignmentStatus, { dot: string; badge: string }> = {
  scheduled: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  in_progress: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  completed: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  cancelled: { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
};

export const EARNING_STATUSES = ["pending", "processing", "paid", "failed", "refunded"] as const;
export type EarningStatus = (typeof EARNING_STATUSES)[number];

export const EARNING_STATUS_STYLE: Record<EarningStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  refunded: "bg-slate-100 text-slate-600",
};

export const ATTENDANCE_LABEL: Record<"present" | "absent" | "half_day" | "leave", string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half day",
  leave: "Leave",
};

export const SKILL_LEVELS = ["beginner", "intermediate", "experienced", "expert"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const AVAILABILITY_OPTIONS = ["Full time", "Seasonal", "Weekends only", "On call"] as const;
export type AvailabilityOption = (typeof AVAILABILITY_OPTIONS)[number];

export const LANGUAGES = [
  "Hindi",
  "Bengali",
  "English",
  "Odia",
  "Assamese",
  "Bhojpuri",
  "Maithili",
  "Punjabi",
  "Marathi",
  "Telugu",
  "Tamil",
] as const;

export const REPORT_REASONS = [
  { value: "fake_job", label: "This job looks fake" },
  { value: "asks_for_money", label: "Employer is asking me for money" },
  { value: "wrong_pay", label: "Pay is different from what was posted" },
  { value: "unsafe", label: "Unsafe working conditions" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "other", label: "Something else" },
] as const;

/* ── Types ─────────────────────────────────────────────────────────────── */

export type WorkerProfile = {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  district: string | null;
  state: string | null;
  village: string | null;
  about: string | null;
  experience_years: number;
  expected_wage: number | null;
  availability: AvailabilityOption;
  languages: string[];
  preferred_categories: string[];
  phone_verified: boolean;
  identity_status: "not_submitted" | "pending" | "verified" | "rejected";
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  is_open_to_work: boolean;
};

export type WorkerSkill = {
  id: string;
  worker_id: string;
  skill: string;
  level: SkillLevel;
  years: number | null;
  created_at: string;
};

export type JobListing = {
  id: string;
  employer_id: string;
  employer_name: string;
  employer_verified: boolean;
  title: string;
  category: JobCategory;
  description: string | null;
  village: string | null;
  district: string;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  pay_type: PayType;
  wage_inr: number;
  start_date: string;
  end_date: string | null;
  workers_needed: number;
  workers_hired: number;
  required_skills: string[];
  experience_required: number;
  work_type: WorkType;
  status: "draft" | "open" | "filled" | "closed" | "cancelled";
  contact_phone: string | null;
  created_at: string;
};

export type JobApplication = {
  id: string;
  job_id: string;
  worker_id: string;
  employer_id: string;
  status: ApplicationStatus;
  message: string | null;
  employer_note: string | null;
  decided_at: string | null;
  created_at: string;
  /** Joined when listing applications — the job itself. */
  job?: JobListing | null;
};

export type WorkAssignment = {
  id: string;
  job_id: string;
  worker_id: string;
  employer_id: string;
  application_id: string | null;
  title: string;
  employer_name: string;
  employer_phone: string | null;
  work_village: string | null;
  work_district: string | null;
  start_date: string;
  end_date: string | null;
  daily_wage: number | null;
  total_pay: number | null;
  instructions: string | null;
  status: AssignmentStatus;
  progress_pct: number;
  created_at: string;
};

export type AttendanceRow = {
  id: string;
  assignment_id: string;
  worker_id: string;
  day: string;
  status: "present" | "absent" | "half_day" | "leave";
  hours_worked: number | null;
  note: string | null;
};

export type WorkerAvailability = {
  id: string;
  worker_id: string;
  day: string;
  available: boolean;
  note: string | null;
};

export type WorkerEarning = {
  id: string;
  worker_id: string;
  employer_id: string | null;
  assignment_id: string | null;
  job_title: string;
  employer_name: string | null;
  amount_inr: number;
  days_worked: number | null;
  period_start: string | null;
  period_end: string | null;
  status: EarningStatus;
  paid_on: string | null;
  reference: string | null;
  created_at: string;
};

export type WorkerReview = {
  id: string;
  assignment_id: string;
  worker_id: string;
  reviewer_id: string;
  reviewer_role: "employer" | "worker";
  rating: number;
  comment: string | null;
  is_reported: boolean;
  created_at: string;
};

export type WorkerNotification = {
  id: string;
  worker_id: string;
  kind: "job" | "application" | "schedule" | "payment" | "verification" | "system";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type WorkerMessage = {
  id: string;
  worker_id: string;
  counterpart_id: string | null;
  counterpart_name: string;
  counterpart_role: string | null;
  job_id: string | null;
  direction: "in" | "out";
  body: string;
  attachment_url: string | null;
  read_at: string | null;
  created_at: string;
};

/* ── Formatting helpers ────────────────────────────────────────────────── */

/** ₹1,43,614 — Indian grouping, no paise unless there are some. */
export function formatINR(value: number, decimals = 0): string {
  return Number(value).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days from today until `date`. Negative when already past. */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** "Starts in 3 days" / "Started today" / "Ended 2 days ago". */
export function startLabel(date: string): string {
  const days = daysUntil(date);
  if (days == null) return date;
  if (days === 0) return "Starts today";
  if (days === 1) return "Starts tomorrow";
  if (days > 1) return `Starts in ${days} days`;
  return `Started ${Math.abs(days)} days ago`;
}

/** Duration in human words: "1 day", "12 days", "Ongoing". */
export function durationLabel(job: Pick<JobListing, "start_date" | "end_date" | "work_type">): string {
  if (!job.end_date) return job.work_type === "half_day" ? "Half day" : "1 day";
  const start = new Date(`${job.start_date}T00:00:00`).getTime();
  const end = new Date(`${job.end_date}T00:00:00`).getTime();
  const days = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * Distance in km between two coordinates (haversine).
 * Returns null when either point is unknown — we never invent a distance.
 */
export function distanceKm(
  a: { lat: number; lng: number } | null,
  b: { lat: number | null; lng: number | null } | null
): number | null {
  if (!a || !b || b.lat == null || b.lng == null) return null;
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/* ── Session helpers ───────────────────────────────────────────────────── */

async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  return user.id;
}

/* ── Worker profile ────────────────────────────────────────────────────── */

/**
 * The signed-in worker's profile row, creating it on first visit from the
 * account's own details (name, phone, district) so the page is never blank.
 * Nothing is invented: a missing phone stays null.
 */
export async function ensureWorkerProfile(seed?: {
  full_name?: string | null;
  phone?: string | null;
  district?: string | null;
  state?: string | null;
  village?: string | null;
  expected_wage?: string | number | null;
  availability?: string | null;
  skills?: string | null;
}): Promise<WorkerProfile> {
  const userId = await currentUserId();
  const { data: existing, error } = await client()
    .from("worker_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing as WorkerProfile;

  const availability = (AVAILABILITY_OPTIONS as readonly string[]).includes(
    String(seed?.availability ?? "")
  )
    ? (seed!.availability as AvailabilityOption)
    : "Full time";

  const wage = Number(seed?.expected_wage);
  const { data, error: insertError } = await client()
    .from("worker_profiles")
    .insert({
      user_id: userId,
      full_name: seed?.full_name ?? null,
      phone: seed?.phone ?? null,
      district: seed?.district ?? null,
      state: seed?.state ?? null,
      village: seed?.village ?? null,
      availability,
      expected_wage: Number.isFinite(wage) && wage > 0 ? wage : null,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return data as WorkerProfile;
}

export type WorkerProfileInput = {
  full_name: string | null;
  phone: string | null;
  district: string | null;
  state: string | null;
  village: string | null;
  about: string | null;
  experience_years: number;
  expected_wage: number | null;
  availability: AvailabilityOption;
  languages: string[];
  preferred_categories: string[];
  is_open_to_work: boolean;
};

export async function saveWorkerProfile(input: WorkerProfileInput): Promise<WorkerProfile> {
  const userId = await currentUserId();
  const { data, error } = await client()
    .from("worker_profiles")
    .upsert({ ...input, user_id: userId }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data as WorkerProfile;
}

/** 0–100. Used by the profile-completion ring on the dashboard. */
export function profileCompletion(profile: WorkerProfile | null, skills: WorkerSkill[]): number {
  if (!profile) return 0;
  const checks = [
    Boolean(profile.full_name),
    Boolean(profile.phone),
    Boolean(profile.district),
    Boolean(profile.about && profile.about.length > 20),
    profile.experience_years > 0 || skills.length > 0,
    Number(profile.expected_wage) > 0,
    profile.languages.length > 0,
    skills.length > 0,
    profile.identity_status !== "not_submitted",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/* ── Skills ────────────────────────────────────────────────────────────── */

export async function listSkills(): Promise<WorkerSkill[]> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("worker_skills")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WorkerSkill[];
}

export async function addSkill(input: {
  skill: string;
  level: SkillLevel;
  years: number | null;
}): Promise<WorkerSkill> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("worker_skills")
    .insert({ ...input, worker_id: workerId })
    .select()
    .single();
  if (error) throw error;
  return data as WorkerSkill;
}

export async function removeSkill(id: string): Promise<void> {
  const { error } = await client().from("worker_skills").delete().eq("id", id);
  if (error) throw error;
}

/* ── Jobs ──────────────────────────────────────────────────────────────── */

export type JobFilters = {
  search?: string;
  category?: JobCategory | "all";
  district?: string | "all";
  minWage?: number | null;
  maxWage?: number | null;
  workType?: WorkType | "all";
  payType?: PayType | "all";
  maxExperience?: number | null;
  availableOnly?: boolean;
};

/**
 * Open jobs. Department-level filtering happens in Postgres; the free-text and
 * distance parts happen in the browser so they never depend on a SQL extension.
 */
export async function listOpenJobs(filters: JobFilters = {}): Promise<JobListing[]> {
  let query = client()
    .from("job_listings")
    .select("*")
    .in("status", ["open", "filled"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.category && filters.category !== "all") query = query.eq("category", filters.category);
  if (filters.district && filters.district !== "all") query = query.eq("district", filters.district);
  if (filters.workType && filters.workType !== "all") query = query.eq("work_type", filters.workType);
  if (filters.payType && filters.payType !== "all") query = query.eq("pay_type", filters.payType);
  if (filters.minWage != null) query = query.gte("wage_inr", filters.minWage);
  if (filters.maxWage != null) query = query.lte("wage_inr", filters.maxWage);
  if (filters.maxExperience != null) {
    query = query.lte("experience_required", filters.maxExperience);
  }
  if (filters.availableOnly) {
    // PostgREST cannot compare one column to another (`workers_hired <
    // workers_needed`), so "still short of workers" is filtered below in memory.
    query = query.eq("status", "open");
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as JobListing[];
  if (filters.availableOnly) {
    rows = rows.filter((job) => job.workers_hired < job.workers_needed);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (job) =>
        job.title.toLowerCase().includes(q) ||
        job.employer_name.toLowerCase().includes(q) ||
        job.category.toLowerCase().includes(q) ||
        (job.village ?? "").toLowerCase().includes(q) ||
        (job.description ?? "").toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function getJob(id: string): Promise<JobListing | null> {
  const { data, error } = await client().from("job_listings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as JobListing | null) ?? null;
}

/* ── Applications ──────────────────────────────────────────────────────── */

/** Applications with their job attached, newest first. */
export async function listApplications(): Promise<JobApplication[]> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("job_applications")
    .select("*, job:job_listings(*)")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as JobApplication[];
}

/** Job ids this worker has already applied to — used to disable Apply buttons. */
export async function appliedJobIds(): Promise<Set<string>> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("job_applications")
    .select("job_id")
    .eq("worker_id", workerId);
  if (error) throw error;
  return new Set((data ?? []).map((row: { job_id: string }) => row.job_id));
}

/**
 * Apply to a job. The employer id is read from the job itself — never from the
 * caller — so an application can only ever land on the real poster's queue.
 */
export async function applyToJob(job: JobListing, message: string | null): Promise<JobApplication> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("job_applications")
    .insert({
      job_id: job.id,
      worker_id: workerId,
      employer_id: job.employer_id,
      message,
      status: "applied",
    })
    .select()
    .single();
  if (error) throw error;
  return data as JobApplication;
}

/** Withdraw an application that has not been decided yet. */
export async function withdrawApplication(id: string): Promise<JobApplication> {
  const { data, error } = await client()
    .from("job_applications")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .in("status", ["applied", "under_review"])
    .select()
    .single();
  if (error) throw error;
  return data as JobApplication;
}

/* ── Assignments & attendance ──────────────────────────────────────────── */

export async function listAssignments(): Promise<WorkAssignment[]> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("work_assignments")
    .select("*")
    .eq("worker_id", workerId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkAssignment[];
}

export async function listAttendance(): Promise<AttendanceRow[]> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("work_attendance")
    .select("*")
    .eq("worker_id", workerId)
    .order("day", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as AttendanceRow[];
}

/** The worker reports progress; the backend/employer owns pay and attendance. */
export async function updateAssignmentProgress(id: string, progress: number): Promise<WorkAssignment> {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const { data, error } = await client()
    .from("work_assignments")
    .update({
      progress_pct: clamped,
      status: clamped >= 100 ? "completed" : clamped > 0 ? "in_progress" : "scheduled",
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as WorkAssignment;
}

/* ── Availability ──────────────────────────────────────────────────────── */

export async function listAvailability(fromISO?: string): Promise<WorkerAvailability[]> {
  const workerId = await currentUserId();
  const from = fromISO ?? todayISO();
  const { data, error } = await client()
    .from("worker_availability")
    .select("*")
    .eq("worker_id", workerId)
    .gte("day", from)
    .order("day", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WorkerAvailability[];
}

export async function setDayAvailability(
  day: string,
  available: boolean,
  note: string | null = null
): Promise<WorkerAvailability> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("worker_availability")
    .upsert({ worker_id: workerId, day, available, note }, { onConflict: "worker_id,day" })
    .select()
    .single();
  if (error) throw error;
  return data as WorkerAvailability;
}

/** Assignments whose dates include `day` — used to warn about clashes. */
export function assignmentsOn(assignments: WorkAssignment[], day: string): WorkAssignment[] {
  return assignments.filter((a) => {
    if (a.status === "cancelled") return false;
    const end = a.end_date ?? a.start_date;
    return day >= a.start_date && day <= end;
  });
}

/* ── Earnings ──────────────────────────────────────────────────────────── */

export async function listEarnings(): Promise<WorkerEarning[]> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("worker_earnings")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkerEarning[];
}

export type EarningsTotals = {
  totalEarned: number;
  thisMonth: number;
  pending: number;
  paid: number;
  jobsCount: number;
  avgPerJob: number;
};

/** KPI figures for the earnings screen. Only `paid` counts as earned. */
export function earningsTotals(rows: WorkerEarning[]): EarningsTotals {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const paidRows = rows.filter((r) => r.status === "paid");
  const totalEarned = paidRows.reduce((sum, r) => sum + Number(r.amount_inr), 0);
  const thisMonth = paidRows
    .filter((r) => {
      const at = new Date(r.paid_on ?? r.created_at);
      return at >= monthStart;
    })
    .reduce((sum, r) => sum + Number(r.amount_inr), 0);
  const pending = rows
    .filter((r) => r.status === "pending" || r.status === "processing")
    .reduce((sum, r) => sum + Number(r.amount_inr), 0);

  return {
    totalEarned,
    thisMonth,
    pending,
    paid: totalEarned,
    jobsCount: paidRows.length,
    avgPerJob: paidRows.length ? Math.round(totalEarned / paidRows.length) : 0,
  };
}

/* ── Reviews ───────────────────────────────────────────────────────────── */

export async function listReviews(): Promise<WorkerReview[]> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("worker_reviews")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkerReview[];
}

export async function reportReview(id: string, reason: string): Promise<void> {
  const { error } = await client()
    .from("worker_reviews")
    .update({ is_reported: true, report_reason: reason })
    .eq("id", id);
  if (error) throw error;
}

/* ── Notifications ─────────────────────────────────────────────────────── */

export async function listWorkerNotifications(): Promise<WorkerNotification[]> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("worker_notifications")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as WorkerNotification[];
}

export async function markWorkerNotificationRead(id: string): Promise<void> {
  const { error } = await client()
    .from("worker_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllWorkerNotificationsRead(): Promise<void> {
  const workerId = await currentUserId();
  const { error } = await client()
    .from("worker_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("worker_id", workerId)
    .is("read_at", null);
  if (error) throw error;
}

/* ── Messages ──────────────────────────────────────────────────────────── */

export async function listWorkerMessages(): Promise<WorkerMessage[]> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("worker_messages")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WorkerMessage[];
}

export async function sendWorkerMessage(params: {
  counterpart_id: string | null;
  counterpart_name: string;
  counterpart_role: string | null;
  job_id: string | null;
  body: string;
}): Promise<WorkerMessage> {
  const workerId = await currentUserId();
  const { data, error } = await client()
    .from("worker_messages")
    .insert({ ...params, worker_id: workerId, direction: "out" })
    .select()
    .single();
  if (error) throw error;
  return data as WorkerMessage;
}

/* ── Safety ────────────────────────────────────────────────────────────── */

export async function reportJob(jobId: string, reason: string, details: string | null): Promise<void> {
  const workerId = await currentUserId();
  const { error } = await client()
    .from("job_reports")
    .insert({ job_id: jobId, worker_id: workerId, reason, details });
  if (error) throw error;
}

/* ── Dashboard derivations ─────────────────────────────────────────────── */

export type WorkerDashboardTotals = {
  availableJobs: number;
  appliedJobs: number;
  activeWork: number;
  completedJobs: number;
  totalEarnings: number;
  pendingPayments: number;
};

export function dashboardTotals(params: {
  jobs: JobListing[];
  applications: JobApplication[];
  assignments: WorkAssignment[];
  earnings: WorkerEarning[];
}): WorkerDashboardTotals {
  const totals = earningsTotals(params.earnings);
  return {
    availableJobs: params.jobs.filter((j) => j.status === "open" && j.workers_hired < j.workers_needed)
      .length,
    appliedJobs: params.applications.filter((a) =>
      ["applied", "under_review", "accepted"].includes(a.status)
    ).length,
    activeWork: params.assignments.filter((a) =>
      ["scheduled", "in_progress"].includes(a.status)
    ).length,
    completedJobs: params.assignments.filter((a) => a.status === "completed").length,
    totalEarnings: totals.totalEarned,
    pendingPayments: totals.pending,
  };
}

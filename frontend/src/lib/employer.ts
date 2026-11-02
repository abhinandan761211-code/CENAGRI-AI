/**
 * Employer data layer — the job-posting side of the worker module.
 *
 * An "employer" is any signed-in account that owns land or a farm business
 * (Farmer, Buyer, Retailer, Warehouse …). There is no separate account type:
 * what makes an account an employer is that it posted a `job_listings` row, and
 * RLS scopes every read and write below to `employer_id = auth.uid()`.
 *
 * Everything is real Supabase access. A missing table raises a real error;
 * an empty table renders an empty state. Nothing is seeded.
 */
import { supabase } from "@/lib/supabase";
import { JOB_CATEGORIES } from "@/lib/worker";
import type { JobCategory, JobListing, PayType, WorkType } from "@/lib/worker";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** Friendly message for the one setup error a fresh deploy can hit. */
export function describeEmployerError(err: unknown): string {
  // Supabase returns PostgrestError-shaped objects, not Error instances, so
  // read `message` off anything that has one before falling back.
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";

  if (/relation|does not exist|schema cache|not find the table/i.test(message)) {
    return "The job posting tables are not set up yet. Run database/supabase/employer.sql in Supabase.";
  }
  if (/permission denied|row-level security|violates row-level/i.test(message)) {
    return "Your account is not allowed to do that. Sign in again and retry.";
  }
  return message || "Something went wrong. Please try again.";
}

export { JOB_CATEGORIES };
export type { JobCategory, PayType, WorkType };

/* ── Types ─────────────────────────────────────────────────────────────── */

/** A row of `employer_applicant_view`: an application plus the worker behind it. */
export type ApplicantRow = {
  application_id: string;
  job_id: string;
  worker_id: string;
  status: "applied" | "under_review" | "accepted" | "rejected" | "withdrawn";
  message: string | null;
  employer_note: string | null;
  created_at: string;
  decided_at: string | null;
  employer_id: string;
  job_title: string;
  job_category: JobCategory;
  wage_inr: number;
  pay_type: PayType;
  work_type: WorkType;
  start_date: string;
  end_date: string | null;
  job_village: string | null;
  job_district: string;
  workers_needed: number;
  workers_hired: number;
  job_status: JobListing["status"];
  worker_name: string | null;
  worker_phone: string | null;
  worker_village: string | null;
  worker_district: string | null;
  worker_experience: number | null;
  worker_expected_wage: number | null;
  worker_rating: number | null;
  worker_rating_count: number | null;
  worker_completed_jobs: number | null;
  worker_identity_status: "not_submitted" | "pending" | "verified" | "rejected" | null;
  worker_phone_verified: boolean | null;
};

/** A row of `employer_job_stats`. */
export type EmployerJobStat = {
  job_id: string;
  employer_id: string;
  title: string;
  category: JobCategory;
  status: JobListing["status"];
  workers_needed: number;
  workers_hired: number;
  wage_inr: number;
  pay_type: PayType;
  work_type: WorkType;
  district: string;
  village: string | null;
  start_date: string;
  end_date: string | null;
  created_at: string;
  pending_applications: number;
  accepted_applications: number;
  total_applications: number;
};

export type EmployerNotification = {
  id: string;
  employer_id: string;
  kind: "application" | "message" | "work" | "system";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/* ── Session ───────────────────────────────────────────────────────────── */

async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  return user.id;
}

/* ── Job listings ──────────────────────────────────────────────────────── */

export type JobInput = {
  title: string;
  category: JobCategory;
  description: string | null;
  village: string | null;
  district: string;
  state: string | null;
  pincode: string | null;
  pay_type: PayType;
  wage_inr: number;
  start_date: string;
  end_date: string | null;
  workers_needed: number;
  required_skills: string[];
  experience_required: number;
  work_type: WorkType;
  contact_phone: string | null;
  /** Draft listings are invisible to workers. */
  status: "draft" | "open";
};

/** The employer's own listings, newest first. */
export async function listMyJobs(): Promise<EmployerJobStat[]> {
  const employerId = await currentUserId();
  const { data, error } = await client()
    .from("employer_job_stats")
    .select("*")
    .eq("employer_id", employerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmployerJobStat[];
}

export async function getMyJob(id: string): Promise<JobListing | null> {
  const { data, error } = await client()
    .from("job_listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as JobListing | null) ?? null;
}

/**
 * Create a job. `employer_id` is taken from the verified session, and the
 * employer name from the account's own profile — never from the caller.
 */
export async function createJob(
  input: JobInput,
  identity: { name: string; verified: boolean }
): Promise<JobListing> {
  const employerId = await currentUserId();
  const { data, error } = await client()
    .from("job_listings")
    .insert({
      ...input,
      employer_id: employerId,
      employer_name: identity.name,
      employer_verified: identity.verified,
    })
    .select()
    .single();
  if (error) throw error;
  return data as JobListing;
}

export async function updateJob(
  id: string,
  patch: Partial<JobInput>
): Promise<JobListing> {
  const { data, error } = await client()
    .from("job_listings")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as JobListing;
}

/** Close or reopen a listing. Closing never deletes applications. */
export async function setJobStatus(
  id: string,
  status: "open" | "closed" | "cancelled"
): Promise<JobListing> {
  const { data, error } = await client()
    .from("job_listings")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as JobListing;
}

/* ── Applicants ────────────────────────────────────────────────────────── */

export async function listApplicants(): Promise<ApplicantRow[]> {
  const employerId = await currentUserId();
  const { data, error } = await client()
    .from("employer_applicant_view")
    .select("*")
    .eq("employer_id", employerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ApplicantRow[];
}

/**
 * Accept or reject an application.
 *
 * Accepting is a single UPDATE: the database trigger from worker.sql creates
 * the assignment, bumps `workers_hired` and notifies the worker, so the UI never
 * has to keep three things in step by itself.
 */
export async function decideApplication(
  applicationId: string,
  decision: "accepted" | "rejected",
  note: string | null = null
): Promise<void> {
  const { error } = await client()
    .from("job_applications")
    .update({
      status: decision,
      employer_note: note,
      decided_at: new Date().toISOString(),
    })
    .eq("id", applicationId);
  if (error) throw error;
}

/** Mark an application as being looked at, so the worker sees movement. */
export async function markUnderReview(applicationId: string): Promise<void> {
  const { error } = await client()
    .from("job_applications")
    .update({ status: "under_review" })
    .eq("id", applicationId)
    .eq("status", "applied");
  if (error) throw error;
}

/* ── Messaging ─────────────────────────────────────────────────────────── */

export type EmployerThreadMessage = {
  id: string;
  worker_id: string;
  counterpart_id: string | null;
  counterpart_name: string;
  job_id: string | null;
  direction: "in" | "out";
  body: string;
  created_at: string;
  read_at: string | null;
};

/**
 * Messages addressed to this employer.
 *
 * `direction` is stored relative to the WORKER ("out" = worker wrote it), so it
 * is flipped here to read naturally from the employer's side.
 */
export async function listEmployerThreads(): Promise<EmployerThreadMessage[]> {
  const employerId = await currentUserId();
  const { data, error } = await client()
    .from("worker_messages")
    .select("id, worker_id, counterpart_id, counterpart_name, job_id, direction, body, created_at, read_at")
    .eq("counterpart_id", employerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as EmployerThreadMessage[]).map((row) => ({
    ...row,
    direction: row.direction === "out" ? "in" : "out",
  }));
}

/**
 * Reply to a worker. `counterpart_id` is the WORKER's id (from the employer's
 * point of view the counterpart is the worker), which is what the RLS insert
 * policy checks against the signed-in employer.
 */
export async function replyToWorker(params: {
  workerId: string;
  workerName: string;
  workerRole: string | null;
  jobId: string | null;
  body: string;
}): Promise<void> {
  const employerId = await currentUserId();
  const { error } = await client()
    .from("worker_messages")
    .insert({
      worker_id: params.workerId,
      counterpart_id: employerId,
      counterpart_name: params.workerName,
      counterpart_role: params.workerRole,
      job_id: params.jobId,
      // From the WORKER's perspective this message came in.
      direction: "in",
      body: params.body,
    });
  if (error) throw error;
}

/* ── Notifications ─────────────────────────────────────────────────────── */

export async function listEmployerNotifications(): Promise<EmployerNotification[]> {
  const employerId = await currentUserId();
  const { data, error } = await client()
    .from("employer_notifications")
    .select("*")
    .eq("employer_id", employerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as EmployerNotification[];
}

export async function markEmployerNotificationsRead(): Promise<void> {
  const employerId = await currentUserId();
  const { error } = await client()
    .from("employer_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("employer_id", employerId)
    .is("read_at", null);
  if (error) throw error;
}

/* ── Derivations ───────────────────────────────────────────────────────── */

export type EmployerTotals = {
  openJobs: number;
  totalJobs: number;
  pendingApplicants: number;
  hired: number;
  filledJobs: number;
};

export function employerTotals(jobs: EmployerJobStat[]): EmployerTotals {
  return {
    openJobs: jobs.filter((j) => j.status === "open").length,
    totalJobs: jobs.length,
    pendingApplicants: jobs.reduce((sum, j) => sum + Number(j.pending_applications ?? 0), 0),
    hired: jobs.reduce((sum, j) => sum + Number(j.workers_hired ?? 0), 0),
    filledJobs: jobs.filter((j) => j.status === "filled").length,
  };
}

/** The identity a listing should carry, from the signed-in account. */
export function employerIdentity(profile: {
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  details?: Record<string, string> | null;
} | null): { name: string; verified: boolean } {
  const shop = profile?.details?.shop_name;
  const farmName = profile?.details?.business_name;
  const name =
    shop ||
    farmName ||
    profile?.full_name ||
    profile?.email?.split("@")[0] ||
    "Employer";
  // A phone on file is the only verification signal available without the admin
  // KYC workflow; anything stronger is set by the backend, not here.
  return { name, verified: false };
}

export { formatDate, formatINR, durationLabel, startLabel } from "@/lib/worker";

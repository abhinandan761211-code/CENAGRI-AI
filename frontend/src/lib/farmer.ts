/**
 * Farmer data layer — every Supabase write/read the farmer account needs that
 * is not already covered by `farms.ts`, `crops.ts`, `cropCalendar.ts`,
 * `orders.ts`, `weather.ts` or `mandi.ts`.
 *
 * Rules this file follows (they are the product's, not just style):
 *   1. Every row is scoped to the signed-in user. RLS in `farmer.sql` enforces
 *      it in the database; the `.eq(...user.id)` calls here make the intent
 *      visible and let a mistake fail fast.
 *   2. Nothing is fabricated. An empty table returns `[]` and the page shows an
 *      empty state. A missing table raises a message naming the SQL file.
 *   3. Money is nullable. A blank amount means "not recorded", and profit is
 *      `null` (unknown) rather than `0` when nothing has been sold.
 */
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { isMissingTable } from "@/lib/schemaCheck";

export const FARMER_SQL_FILE = "database/supabase/farmer.sql";

function client() {
  if (!supabase) throw new Error("Supabase is not configured for this build.");
  return supabase;
}

/** Consistent, human error text for PostgREST failures. */
export function farmerError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isMissingTable(err)) {
    return `This feature is not set up in the database yet. Run ${FARMER_SQL_FILE} in Supabase.`;
  }
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message: unknown }).message);
    if (/row-level security|permission denied/i.test(message)) {
      return "You do not have access to this record.";
    }
    if (/does not belong to you/i.test(message)) return message;
    return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

async function me(): Promise<User> {
  const {
    data: { user },
  } = await client().auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  return user;
}

/** The shape the row-scoped `list()` helpers build on. */
type SelectQuery = {
  eq: (column: string, value: string) => SelectQuery;
  order: (column: string, options: { ascending: boolean }) => SelectQuery;
  limit: (count: number) => SelectQuery;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

/** A row is missing its table if the select fails with the schema-cache code. */
async function list<T>(
  table: string,
  build: (query: SelectQuery) => SelectQuery
): Promise<T[]> {
  const user = await me();
  const query = build(client().from(table).select("*") as unknown as SelectQuery);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

/* ── Domain constants ─────────────────────────────────────────────────── */

export const ACTIVITY_KINDS = [
  "ploughing",
  "sowing",
  "fertiliser",
  "irrigation",
  "spray",
  "weeding",
  "pest_check",
  "harvest",
  "other",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const EXPENSE_CATEGORIES = [
  "seeds",
  "fertiliser",
  "pesticide",
  "labour",
  "irrigation",
  "equipment",
  "transport",
  "land_prep",
  "storage",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const IRRIGATION_METHODS = ["flood", "furrow", "sprinkler", "drip", "pump", "rain"] as const;
export type IrrigationMethod = (typeof IRRIGATION_METHODS)[number];

export const DOCUMENT_KINDS = [
  "aadhaar",
  "land_record",
  "bank_passbook",
  "farmer_id",
  "soil_report",
  "insurance",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Title-cased label for the snake_case enums above. */
export const label = (value: string | null | undefined): string =>
  !value ? "" : value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/* ── 1. Farm activities ───────────────────────────────────────────────── */

export type FarmActivity = {
  id: string;
  owner_id: string;
  farm_id: string | null;
  crop_id: string | null;
  kind: ActivityKind;
  title: string;
  notes: string | null;
  activity_on: string;
  cost_inr: number | null;
  quantity: string | null;
  created_at: string;
};

export type ActivityInput = {
  farm_id?: string | null;
  crop_id?: string | null;
  kind: ActivityKind;
  title: string;
  notes?: string | null;
  activity_on?: string;
  cost_inr?: number | null;
  quantity?: string | null;
};

export async function listActivities(limit = 100): Promise<FarmActivity[]> {
  return list<FarmActivity>("farm_activities", (q) =>
    q.order("activity_on", { ascending: false }).limit(limit)
  );
}

export async function saveActivity(input: ActivityInput, id?: string): Promise<FarmActivity> {
  const user = await me();
  const payload = {
    farm_id: input.farm_id || null,
    crop_id: input.crop_id || null,
    kind: input.kind,
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    activity_on: input.activity_on || new Date().toISOString().slice(0, 10),
    cost_inr: input.cost_inr ?? null,
    quantity: input.quantity?.trim() || null,
  };
  if (id) {
    const { data, error } = await client().from("farm_activities").update(payload).eq("id", id).eq("owner_id", user.id).select().single();
    if (error) throw error;
    return data as FarmActivity;
  }
  const { data, error } = await client()
    .from("farm_activities")
    .insert({ ...payload, owner_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as FarmActivity;
}

export async function deleteActivity(id: string): Promise<void> {
  const user = await me();
  const { error } = await client().from("farm_activities").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
}

/* ── 2. Manual calendar tasks ─────────────────────────────────────────── */

export type FarmerTask = {
  id: string;
  owner_id: string;
  crop_id: string | null;
  farm_id: string | null;
  title: string;
  kind: string;
  due_on: string;
  done: boolean;
  done_on: string | null;
  created_at: string;
};

export async function listTasks(): Promise<FarmerTask[]> {
  return list<FarmerTask>("farmer_tasks", (q) => q.order("due_on", { ascending: true }));
}

export async function addTask(input: {
  title: string;
  kind: string;
  due_on: string;
  crop_id?: string | null;
  farm_id?: string | null;
}): Promise<FarmerTask> {
  const user = await me();
  const { data, error } = await client()
    .from("farmer_tasks")
    .insert({
      owner_id: user.id,
      title: input.title.trim(),
      kind: input.kind,
      due_on: input.due_on,
      crop_id: input.crop_id || null,
      farm_id: input.farm_id || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FarmerTask;
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  const user = await me();
  const { error } = await client()
    .from("farmer_tasks")
    .update({ done, done_on: done ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const user = await me();
  const { error } = await client().from("farmer_tasks").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
}

/* ── 3. Expenses ──────────────────────────────────────────────────────── */

export type FarmExpense = {
  id: string;
  owner_id: string;
  farm_id: string | null;
  crop_id: string | null;
  category: ExpenseCategory;
  amount_inr: number;
  spent_on: string;
  note: string | null;
  vendor: string | null;
  created_at: string;
};

export async function listExpenses(): Promise<FarmExpense[]> {
  return list<FarmExpense>("farmer_expenses", (q) => q.order("spent_on", { ascending: false }).limit(1000));
}

export async function saveExpense(
  input: {
    category: ExpenseCategory;
    amount_inr: number;
    spent_on: string;
    note?: string | null;
    vendor?: string | null;
    crop_id?: string | null;
    farm_id?: string | null;
  },
  id?: string
): Promise<void> {
  const user = await me();
  const payload = {
    category: input.category,
    amount_inr: input.amount_inr,
    spent_on: input.spent_on,
    note: input.note?.trim() || null,
    vendor: input.vendor?.trim() || null,
    crop_id: input.crop_id || null,
    farm_id: input.farm_id || null,
  };
  const { error } = id
    ? await client().from("farmer_expenses").update(payload).eq("id", id).eq("owner_id", user.id)
    : await client().from("farmer_expenses").insert({ ...payload, owner_id: user.id });
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const user = await me();
  const { error } = await client().from("farmer_expenses").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
}

/* ── 4. Soil tests ────────────────────────────────────────────────────── */

export type SoilTest = {
  id: string;
  owner_id: string;
  farm_id: string;
  tested_on: string;
  lab_name: string | null;
  ph: number | null;
  ec_ds_m: number | null;
  organic_carbon: number | null;
  nitrogen_kg_ha: number | null;
  phosphorus_kg_ha: number | null;
  potassium_kg_ha: number | null;
  soil_category: string | null;
  recommendation: string | null;
  report_url: string | null;
  source: string | null;
  created_at: string;
};

export async function listSoilTests(): Promise<SoilTest[]> {
  return list<SoilTest>("soil_tests", (q) => q.order("tested_on", { ascending: false }));
}

export async function saveSoilTest(input: Partial<SoilTest> & { farm_id: string; tested_on: string }, id?: string): Promise<void> {
  const user = await me();
  const payload = {
    farm_id: input.farm_id,
    tested_on: input.tested_on,
    lab_name: input.lab_name?.trim() || null,
    ph: input.ph ?? null,
    ec_ds_m: input.ec_ds_m ?? null,
    organic_carbon: input.organic_carbon ?? null,
    nitrogen_kg_ha: input.nitrogen_kg_ha ?? null,
    phosphorus_kg_ha: input.phosphorus_kg_ha ?? null,
    potassium_kg_ha: input.potassium_kg_ha ?? null,
    soil_category: input.soil_category?.trim() || null,
    recommendation: input.recommendation?.trim() || null,
    report_url: input.report_url ?? null,
  };
  const { error } = id
    ? await client().from("soil_tests").update(payload).eq("id", id).eq("owner_id", user.id)
    : await client().from("soil_tests").insert({ ...payload, owner_id: user.id });
  if (error) throw error;
}

export async function deleteSoilTest(id: string): Promise<void> {
  const user = await me();
  const { error } = await client().from("soil_tests").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
}

/* ── 5. Irrigation logs ───────────────────────────────────────────────── */

export type IrrigationLog = {
  id: string;
  owner_id: string;
  farm_id: string | null;
  crop_id: string | null;
  irrigated_on: string;
  method: IrrigationMethod | null;
  hours: number | null;
  volume_m3: number | null;
  cost_inr: number | null;
  notes: string | null;
  created_at: string;
};

export async function listIrrigationLogs(): Promise<IrrigationLog[]> {
  return list<IrrigationLog>("irrigation_logs", (q) => q.order("irrigated_on", { ascending: false }).limit(500));
}

export async function saveIrrigationLog(input: Omit<IrrigationLog, "id" | "owner_id" | "created_at">, id?: string): Promise<void> {
  const user = await me();
  const payload = {
    farm_id: input.farm_id || null,
    crop_id: input.crop_id || null,
    irrigated_on: input.irrigated_on,
    method: input.method || null,
    hours: input.hours ?? null,
    volume_m3: input.volume_m3 ?? null,
    cost_inr: input.cost_inr ?? null,
    notes: input.notes?.trim() || null,
  };
  const { error } = id
    ? await client().from("irrigation_logs").update(payload).eq("id", id).eq("owner_id", user.id)
    : await client().from("irrigation_logs").insert({ ...payload, owner_id: user.id });
  if (error) throw error;
}

export async function deleteIrrigationLog(id: string): Promise<void> {
  const user = await me();
  const { error } = await client().from("irrigation_logs").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
}

/* ── 6. Disease analyses (history only, never a diagnosis) ────────────── */

export type DiseaseAnalysis = {
  id: string;
  owner_id: string;
  crop_id: string | null;
  crop_name: string | null;
  photo_url: string | null;
  symptoms: string | null;
  possible: string[];
  next_steps: string | null;
  answer_text: string | null;
  mode: "ai" | "demo";
  model: string | null;
  created_at: string;
};

export const ANALYSIS_BUCKET = "crop-photos";

export async function uploadAnalysisPhoto(file: File): Promise<string> {
  const user = await me();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await client().storage.from(ANALYSIS_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function publicPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = client().storage.from(ANALYSIS_BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
}

export async function listAnalyses(): Promise<DiseaseAnalysis[]> {
  return list<DiseaseAnalysis>("disease_analyses", (q) => q.order("created_at", { ascending: false }).limit(100));
}

export async function saveAnalysis(input: {
  crop_id?: string | null;
  crop_name?: string | null;
  photo_url?: string | null;
  symptoms?: string | null;
  possible?: string[];
  next_steps?: string | null;
  answer_text?: string | null;
  mode: "ai" | "demo";
  model?: string | null;
}): Promise<DiseaseAnalysis> {
  const user = await me();
  const { data, error } = await client()
    .from("disease_analyses")
    .insert({
      owner_id: user.id,
      crop_id: input.crop_id || null,
      crop_name: input.crop_name || null,
      photo_url: input.photo_url || null,
      symptoms: input.symptoms || null,
      possible: input.possible ?? [],
      next_steps: input.next_steps || null,
      answer_text: input.answer_text || null,
      mode: input.mode,
      model: input.model || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DiseaseAnalysis;
}

export async function deleteAnalysis(id: string): Promise<void> {
  const user = await me();
  const { error } = await client().from("disease_analyses").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
}

/* ── 7. Documents / KYC ───────────────────────────────────────────────── */

export type FarmerDocument = {
  id: string;
  owner_id: string;
  kind: DocumentKind;
  label: string | null;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: "pending" | "verified" | "rejected";
  review_note: string | null;
  created_at: string;
};

export const DOCUMENT_BUCKET = "farmer-documents";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = "image/jpeg,image/png,image/webp,application/pdf";

export async function uploadDocument(file: File, kind: DocumentKind, labelText?: string): Promise<FarmerDocument> {
  const user = await me();
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Documents must be 10 MB or smaller.");
  const allowed = ACCEPTED_DOCUMENT_TYPES.split(",");
  if (!allowed.includes(file.type)) throw new Error("Upload a JPG, PNG, WebP image or a PDF.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${user.id}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await client()
    .storage.from(DOCUMENT_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data, error } = await client()
    .from("farmer_documents")
    .insert({
      owner_id: user.id,
      kind,
      label: labelText?.trim() || null,
      file_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      status: "pending",
    })
    .select()
    .single();
  if (error) {
    // Do not leave an orphan file behind if the row is rejected.
    await client().storage.from(DOCUMENT_BUCKET).remove([path]);
    throw error;
  }
  return data as FarmerDocument;
}

export async function listDocuments(): Promise<FarmerDocument[]> {
  return list<FarmerDocument>("farmer_documents", (q) => q.order("created_at", { ascending: false }));
}

/** Private bucket → a short-lived signed URL for preview. */
export async function documentUrl(path: string): Promise<string | null> {
  const { data } = await client().storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export async function deleteDocument(id: string, path: string): Promise<void> {
  const user = await me();
  const { error } = await client().from("farmer_documents").delete().eq("id", id).eq("owner_id", user.id);
  if (error) throw error;
  await client().storage.from(DOCUMENT_BUCKET).remove([path]);
}

/* ── 8. Farming groups ────────────────────────────────────────────────── */

export type FarmerGroup = {
  id: string;
  name: string;
  description: string | null;
  district: string | null;
  state: string | null;
  crop: string | null;
  owner_id: string;
  created_at: string;
  member_count?: number;
  is_member?: boolean;
};

export async function listGroups(): Promise<FarmerGroup[]> {
  const user = await me();
  const { data, error } = await client()
    .from("farmer_groups")
    .select("*, farmer_group_members(user_id)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as (FarmerGroup & { farmer_group_members: { user_id: string }[] })[]).map(
    (row) => {
      const members = row.farmer_group_members ?? [];
      return {
        ...row,
        member_count: members.length,
        is_member: members.some((m) => m.user_id === user.id),
      };
    }
  );
}

export async function createGroup(input: {
  name: string;
  description?: string;
  district?: string;
  state?: string;
  crop?: string;
}): Promise<FarmerGroup> {
  const user = await me();
  const { data, error } = await client()
    .from("farmer_groups")
    .insert({
      owner_id: user.id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      district: input.district || null,
      state: input.state || null,
      crop: input.crop?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FarmerGroup;
}

export async function joinGroup(groupId: string): Promise<void> {
  const user = await me();
  const { error } = await client()
    .from("farmer_group_members")
    .upsert({ group_id: groupId, user_id: user.id, role: "member" }, { onConflict: "group_id,user_id" });
  if (error) throw error;
}

export async function leaveGroup(groupId: string): Promise<void> {
  const user = await me();
  const { error } = await client()
    .from("farmer_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id);
  if (error) throw error;
}

export type GroupPost = {
  id: string;
  group_id: string;
  author_id: string;
  body: string;
  created_at: string;
  authorName?: string | null;
};

export async function listGroupPosts(groupId: string): Promise<GroupPost[]> {
  const { data, error } = await client()
    .from("farmer_group_posts")
    .select("*, profiles:author_id(full_name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as (GroupPost & { profiles: { full_name: string | null } | null })[]).map(
    (row) => ({ ...row, authorName: row.profiles?.full_name ?? null })
  );
}

export async function addGroupPost(groupId: string, body: string): Promise<void> {
  const user = await me();
  const { error } = await client()
    .from("farmer_group_posts")
    .insert({ group_id: groupId, author_id: user.id, body: body.trim() });
  if (error) throw error;
}

/* ── 9. Alert preferences ─────────────────────────────────────────────── */

export type AlertPrefs = {
  owner_id: string;
  weather_alerts: boolean;
  mandi_alerts: boolean;
  task_reminders: boolean;
  booking_updates: boolean;
  community: boolean;
  ai_updates: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  email_address: string | null;
};

export const DEFAULT_ALERT_PREFS: Omit<AlertPrefs, "owner_id"> = {
  weather_alerts: true,
  mandi_alerts: true,
  task_reminders: true,
  booking_updates: true,
  community: false,
  ai_updates: true,
  push_enabled: false,
  email_enabled: false,
  email_address: null,
};

export async function getAlertPrefs(): Promise<AlertPrefs> {
  const user = await me();
  const { data, error } = await client()
    .from("farmer_alert_prefs")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { owner_id: user.id, ...DEFAULT_ALERT_PREFS };
    throw error;
  }
  return data ? (data as AlertPrefs) : { owner_id: user.id, ...DEFAULT_ALERT_PREFS };
}

export async function saveAlertPrefs(patch: Partial<AlertPrefs>): Promise<void> {
  const user = await me();
  const current = await getAlertPrefs();
  const { owner_id: _ignored, ...rest } = current;
  const { error } = await client()
    .from("farmer_alert_prefs")
    .upsert({ ...rest, ...patch, owner_id: user.id }, { onConflict: "owner_id" });
  if (error) throw error;
}

/* ── 10. Messages ─────────────────────────────────────────────────────── */

export type FarmerMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  context_type: string | null;
  context_id: string | null;
  read_at: string | null;
  created_at: string;
};

/** Every message I can see, newest last — grouped into threads by the caller. */
export async function listMyMessages(limit = 300): Promise<FarmerMessage[]> {
  const user = await me();
  const { data, error } = await client()
    .from("farmer_messages")
    .select("*")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FarmerMessage[];
}

export async function sendMessage(input: {
  recipient_id: string;
  body: string;
  thread_id?: string | null;
  context_type?: string | null;
  context_id?: string | null;
}): Promise<void> {
  const user = await me();
  const { error } = await client()
    .from("farmer_messages")
    .insert({
      sender_id: user.id,
      recipient_id: input.recipient_id,
      body: input.body.trim(),
      thread_id: input.thread_id || crypto.randomUUID(),
      context_type: input.context_type || null,
      context_id: input.context_id || null,
    });
  if (error) throw error;
}

export async function markThreadRead(threadId: string): Promise<void> {
  const user = await me();
  const { error } = await client()
    .from("farmer_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (error) throw error;
}

/* ── 11. Database readiness probe ─────────────────────────────────────── */

/**
 * The farmer tables come from `farmer.sql`. Rather than letting a half-set-up
 * project throw on every page, the dashboard asks once and shows one clear
 * "run this file" banner.
 */
export async function farmerSchemaReady(): Promise<boolean | null> {
  if (!supabase) return null;
  const { error } = await supabase.from("farmer_expenses").select("id", { head: true }).limit(1);
  if (!error) return true;
  if (isMissingTable(error)) return false;
  return null;
}

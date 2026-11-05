import { supabase } from "@/lib/supabase";

/**
 * Support and account requests — the writes behind Help & Account Management.
 *
 * Both used to be `localStorage` only. A support ticket never reached the admin
 * Support inbox and a deletion request was never seen by anybody, yet the UI
 * said "saved". These now go to `support_tickets` and `admin_deletion_requests`
 * (database/supabase/support.sql opens the two insert policies users need).
 *
 * The browser copy is kept as a convenience: if the network drops, the reference
 * is still quotable on the helpline. It is never treated as the record of truth.
 */

export type SupportCategory = "general" | "account" | "order" | "payment" | "content" | "kyc" | "bug" | "other";

export type TicketInput = {
  subject: string;
  message: string;
  category?: SupportCategory;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

/** Maps the friendly type chosen in the form onto the table's enum. */
export function categoryFor(type: string): SupportCategory {
  const value = type.toLowerCase();
  if (/account|profile|login|password/.test(value)) return "account";
  if (/order|purchase|sale/.test(value)) return "order";
  if (/payment|refund|money/.test(value)) return "payment";
  if (/kyc|document|verif/.test(value)) return "kyc";
  if (/bug|error|crash|broken/.test(value)) return "bug";
  if (/listing|content|video/.test(value)) return "content";
  return "general";
}

function reference(id: string): string {
  return `CAS-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/**
 * Opens a support ticket and returns the reference shown to the farmer.
 *
 * The first message goes into `support_messages` so the admin side opens the
 * thread with the text attached, not an empty ticket. That insert is attempted
 * after the ticket exists; a failure there does not lose the ticket.
 */
export async function createSupportTicket(input: TicketInput): Promise<string> {
  if (!supabase) throw new Error("Support is not connected on this deployment.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again to send a support request.");

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      user_id: user.id,
      contact_email: input.contactEmail ?? user.email ?? null,
      subject: input.subject.trim().slice(0, 160),
      category: input.category ?? "general",
      priority: "normal",
      status: "open",
    })
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("The ticket was not created. Please try again.");

  const ticketId = (data as { id: string }).id;

  // Best effort: the ticket exists either way, and an admin can still read the
  // subject. A missing message is recoverable; a lost ticket is not.
  await supabase
    .from("support_messages")
    .insert({
      ticket_id: ticketId,
      author_id: user.id,
      author_kind: "user",
      body: input.message.trim().slice(0, 4000),
    })
    .then(
      () => undefined,
      () => undefined
    );

  return reference(ticketId);
}

/** The farmer's own tickets, newest first. Empty when the table is not set up. */
export async function listMyTickets() {
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, subject, category, status, created_at, resolution")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return [];
  return data ?? [];
}

/**
 * Files an account deletion request for admin review.
 *
 * Returns `"already"` when a pending request exists — the unique index in
 * support.sql enforces this, so a double tap cannot queue two deletions.
 */
export async function requestAccountDeletion(reason: string): Promise<"created" | "already"> {
  if (!supabase) throw new Error("Account management is not connected on this deployment.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  const { error } = await supabase
    .from("admin_deletion_requests")
    .insert({ user_id: user.id, reason: reason.trim().slice(0, 500) || null, status: "pending" });

  if (error) {
    // 23505 = unique violation on the one-pending-request index.
    if (error.code === "23505") return "already";
    throw error;
  }
  return "created";
}

/** Whether this account already has a pending deletion request. */
export async function hasPendingDeletion(): Promise<boolean> {
  if (!supabase) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("admin_deletion_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  return Boolean(data);
}

/* ── Device-local copies (offline reference only) ─────────────────────────── */

const SUPPORT_KEY = "kalika.support";
const DELETION_KEY = "kalika.deletion";

export function storeLocalTicket(entry: Record<string, unknown>) {
  try {
    const rows = JSON.parse(localStorage.getItem(SUPPORT_KEY) ?? "[]") as unknown[];
    rows.push(entry);
    localStorage.setItem(SUPPORT_KEY, JSON.stringify(rows.slice(-20)));
  } catch {
    /* private mode / quota — the server copy already exists */
  }
}

export function storeLocalDeletion(entry: Record<string, unknown>) {
  try {
    const rows = JSON.parse(localStorage.getItem(DELETION_KEY) ?? "[]") as unknown[];
    rows.push(entry);
    localStorage.setItem(DELETION_KEY, JSON.stringify(rows.slice(-5)));
  } catch {
    /* private mode / quota — the server copy already exists */
  }
}

import { supabase } from "@/lib/supabase";

/**
 * Turns a PostgREST error into something a farmer can act on.
 *
 * The important distinction: a missing table is a setup problem (name the SQL
 * file), while an expired session or a network failure is not — blaming the
 * schema there sends everyone looking in the wrong place.
 */
function readError(error: { code?: string; message: string }, table: string): Error {
  if (error.code === "42P01" || /does not exist/i.test(error.message)) {
    return new Error(`The ${table} table is missing. Apply database/supabase/features.sql.`);
  }
  if (error.code === "42501" || error.code === "PGRST301" || /jwt|permission/i.test(error.message)) {
    return new Error("Your session has expired. Sign in again to load this page.");
  }
  return new Error(error.message);
}

/**
 * Farmer-side service marketplace: rent a machine, hire a truck, book storage.
 *
 * The three screens (`/equipment`, `/transport`, `/storage`) were "demo previews":
 * they read no data and called no API even though `features.sql` already defines
 * `equipment`, `equipment_bookings`, `vehicles`, `transport_requests`,
 * `warehouses` and `storage_bookings`. Owners on the other side of those same
 * tables (equipment owner, transporter, warehouse accounts) publish rows that a
 * farmer could never see.
 *
 * Everything below reads those tables directly. RLS decides visibility: the
 * policies in features.sql let any signed-in account read available listings and
 * let the renter create their own booking/request row.
 */

/* ── Equipment ────────────────────────────────────────────────────────────── */

export type RentableMachine = {
  id: string;
  title: string;
  kind: string;
  rate_inr: number;
  rate_unit: string;
  district: string | null;
  state: string | null;
  owner_name: string | null;
};

export type MyMachineBooking = {
  id: string;
  equipment_id: string;
  starts_on: string;
  ends_on: string;
  status: "requested" | "accepted" | "declined" | "completed";
  machine_title: string | null;
};

export async function listRentableMachines(district?: string | null): Promise<RentableMachine[]> {
  if (!supabase) return [];

  let query = supabase
    .from("equipment")
    .select("id, title, kind, rate_inr, rate_unit, district, state, owner_id")
    .eq("available", true)
    .order("created_at", { ascending: false })
    .limit(60);

  // A district filter is a convenience, not a requirement: with none set the
  // farmer sees every machine rather than an empty screen.
  if (district) query = query.eq("district", district);

  const { data, error } = await query;
  if (error) throw readError(error, "equipment");

  const rows = (data ?? []) as (RentableMachine & { owner_id: string })[];
  if (rows.length === 0) return [];

  // Owner names come from `profiles`, one query for the whole page rather than
  // one per card.
  const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
  const { data: owners } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ownerIds);

  const nameById = new Map(
    ((owners ?? []) as { id: string; full_name: string | null }[]).map((o) => [o.id, o.full_name])
  );

  return rows.map((r) => ({ ...r, owner_name: nameById.get(r.owner_id) ?? null }));
}

export async function bookMachine(input: {
  equipmentId: string;
  startsOn: string;
  endsOn: string;
}): Promise<void> {
  if (!supabase) throw new Error("Rental is not connected on this deployment.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  if (input.endsOn < input.startsOn) throw new Error("The end date cannot be before the start date.");

  const { error } = await supabase.from("equipment_bookings").insert({
    equipment_id: input.equipmentId,
    renter_id: user.id,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    status: "requested",
  });
  if (error) throw readError(error, "equipment_bookings");
}

export async function listMyMachineBookings(): Promise<MyMachineBooking[]> {
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("equipment_bookings")
    .select("id, equipment_id, starts_on, ends_on, status, equipment(title)")
    .eq("renter_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return [];
  // Supabase types a to-one nested select as an array; read the first element.
  const rows = (data ?? []) as unknown as (Omit<MyMachineBooking, "machine_title"> & {
    equipment: { title: string }[] | { title: string } | null;
  })[];

  return rows.map((r) => {
    const nested = Array.isArray(r.equipment) ? r.equipment[0] : r.equipment;
    return {
      id: r.id,
      equipment_id: r.equipment_id,
      starts_on: r.starts_on,
      ends_on: r.ends_on,
      status: r.status,
      machine_title: nested?.title ?? null,
    };
  });
}

/* ── Transport ────────────────────────────────────────────────────────────── */

export type AvailableVehicle = {
  id: string;
  kind: string;
  capacity_kg: number;
  district: string | null;
  state: string | null;
};

export type MyTransportRequest = {
  id: string;
  pickup: string;
  dropoff: string;
  load_kg: number | null;
  needed_on: string | null;
  status: "open" | "assigned" | "completed" | "cancelled";
};

export async function listAvailableVehicles(): Promise<AvailableVehicle[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, kind, capacity_kg, district, state")
    .eq("available", true)
    .order("capacity_kg", { ascending: false })
    .limit(60);
  if (error) throw readError(error, "vehicles");
  return (data ?? []) as AvailableVehicle[];
}

export async function createTransportRequest(input: {
  pickup: string;
  dropoff: string;
  loadKg?: number | null;
  neededOn?: string | null;
}): Promise<void> {
  if (!supabase) throw new Error("Transport is not connected on this deployment.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  if (!input.pickup.trim() || !input.dropoff.trim()) {
    throw new Error("Add both a pickup and a drop-off place.");
  }

  const { error } = await supabase.from("transport_requests").insert({
    requester_id: user.id,
    pickup: input.pickup.trim().slice(0, 200),
    dropoff: input.dropoff.trim().slice(0, 200),
    load_kg: input.loadKg ?? null,
    needed_on: input.neededOn || null,
    status: "open",
  });
  if (error) throw readError(error, "transport_requests");
}

export async function listMyTransportRequests(): Promise<MyTransportRequest[]> {
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("transport_requests")
    .select("id, pickup, dropoff, load_kg, needed_on, status")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []) as MyTransportRequest[];
}

/* ── Storage ──────────────────────────────────────────────────────────────── */

export type StorageOption = {
  id: string;
  name: string;
  kind: string;
  capacity_kg: number;
  available_kg: number;
  district: string | null;
  state: string | null;
  rate_inr: number | null;
  rate_unit: string;
};

export type MyStorageBooking = {
  id: string;
  warehouse_id: string;
  quantity_kg: number;
  starts_on: string;
  ends_on: string;
  status: string;
  warehouse_name: string | null;
};

export async function listStorageOptions(): Promise<StorageOption[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name, kind, capacity_kg, available_kg, district, state, rate_inr, rate_unit")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw readError(error, "warehouses");
  return (data ?? []) as StorageOption[];
}

export async function createStorageBooking(input: {
  warehouseId: string;
  quantityKg: number;
  startsOn: string;
  endsOn: string;
}): Promise<void> {
  if (!supabase) throw new Error("Storage is not connected on this deployment.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");

  // `quantity_kg`, `starts_on` and `ends_on` are all NOT NULL in features.sql, so
  // they are validated here rather than left to a constraint error.
  if (!(input.quantityKg > 0)) throw new Error("Enter how many kilograms you want to store.");
  if (!input.startsOn || !input.endsOn) throw new Error("Choose the storage start and end date.");
  if (input.endsOn < input.startsOn) throw new Error("The end date cannot be before the start date.");

  const { error } = await supabase.from("storage_bookings").insert({
    warehouse_id: input.warehouseId,
    farmer_id: user.id,
    quantity_kg: input.quantityKg,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    status: "requested",
  });
  if (error) throw readError(error, "storage_bookings");
}

export async function listMyStorageBookings(): Promise<MyStorageBooking[]> {
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("storage_bookings")
    .select("id, warehouse_id, quantity_kg, starts_on, ends_on, status, warehouses(name)")
    .eq("farmer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return [];
  const rows = (data ?? []) as unknown as (Omit<MyStorageBooking, "warehouse_name"> & {
    warehouses: { name: string }[] | { name: string } | null;
  })[];

  return rows.map((r) => {
    const nested = Array.isArray(r.warehouses) ? r.warehouses[0] : r.warehouses;
    return {
      id: r.id,
      warehouse_id: r.warehouse_id,
      quantity_kg: r.quantity_kg,
      starts_on: r.starts_on,
      ends_on: r.ends_on,
      status: r.status,
      warehouse_name: nested?.name ?? null,
    };
  });
}

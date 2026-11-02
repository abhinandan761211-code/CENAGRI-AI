import { useMemo, useState } from "react";
import { Flag, Star } from "lucide-react";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import { SectionHeading } from "@/components/equipment/ui";
import {
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Panel,
  StatCard,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  describeEquipmentError,
  formatDate,
  listBookings,
  listEquipment,
  listReviews,
  reportReview,
} from "@/lib/equipment";
import type { Equipment, EquipmentBooking, EquipmentReview } from "@/lib/equipment";

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3 w-3 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
        />
      ))}
    </span>
  );
}

/**
 * Reviews & Ratings.
 *
 * Only a renter with a completed booking can review — enforced by a unique
 * constraint on (booking_id, reviewer_id) and by RLS, so one job cannot be
 * reviewed twice. The owner can flag a review; it is never silently deleted.
 */
export default function EquipmentReviews() {
  const D = describeEquipmentError;
  const reviews = useWorkerData<EquipmentReview[]>(() => listReviews(), [], D);
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);
  const bookings = useWorkerData<EquipmentBooking[]>(() => listBookings(), [], D);

  const [reportTarget, setReportTarget] = useState<EquipmentReview | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reviewList = reviews.data ?? [];
  const equipmentList = equipment.data ?? [];
  const bookingList = bookings.data ?? [];

  const stats = useMemo(() => {
    if (reviewList.length === 0) return { avg: 0, count: 0, operatorAvg: null as number | null };
    const avg = reviewList.reduce((s, r) => s + r.equipment_rating, 0) / reviewList.length;
    const withOperator = reviewList.filter((r) => r.operator_rating != null);
    const operatorAvg =
      withOperator.length > 0
        ? withOperator.reduce((s, r) => s + Number(r.operator_rating), 0) / withOperator.length
        : null;
    return { avg, count: reviewList.length, operatorAvg };
  }, [reviewList]);

  /** Per-machine averages, so a weak machine stands out. */
  const perMachine = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of reviewList) {
      const row = map.get(r.equipment_id) ?? { sum: 0, count: 0 };
      row.sum += r.equipment_rating;
      row.count += 1;
      map.set(r.equipment_id, row);
    }
    return [...map.entries()]
      .map(([id, v]) => ({
        id,
        name: equipmentList.find((e) => e.id === id)?.title ?? "Machine",
        avg: v.sum / v.count,
        count: v.count,
      }))
      .sort((a, b) => b.avg - a.avg);
  }, [reviewList, equipmentList]);

  async function handleReport() {
    if (!reportTarget) return;
    if (reason.trim().length < 5) {
      setError("Say briefly why this review is being flagged.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await reportReview(reportTarget.id, reason.trim());
      setReportTarget(null);
      setReason("");
      reviews.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  if (reviews.state === "loading") {
    return (
      <EquipmentLayout title="Reviews & Ratings">
        <Loading label="Loading reviews…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout title="Reviews & Ratings" subtitle="Feedback from completed rentals">
      {reviews.state === "error" && <ErrorNotice message={reviews.error} onRetry={reviews.reload} />}
      {error && <ErrorNotice message={error} />}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Average rating"
          value={stats.count > 0 ? `${stats.avg.toFixed(1)}/5` : "—"}
          hint={stats.count > 0 ? `${stats.count} review(s)` : "No review yet"}
          icon={Star}
          tone="brand"
        />
        <StatCard
          label="Operator rating"
          value={stats.operatorAvg != null ? `${stats.operatorAvg.toFixed(1)}/5` : "—"}
          hint="Where rated"
          icon={Star}
        />
        <StatCard label="Machines rated" value={String(perMachine.length)} hint="Of your fleet" icon={Star} />
        <StatCard
          label="Flagged"
          value={String(reviewList.filter((r) => r.is_reported).length)}
          hint="Reported by you"
          icon={Flag}
          tone={reviewList.some((r) => r.is_reported) ? "amber" : undefined}
        />
      </section>

      {perMachine.length > 0 && (
        <Panel title="Rating by machine" description="Which machine earns the praise">
          <ul className="divide-y divide-slate-100">
            {perMachine.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-forest">{row.name}</span>
                <Stars value={Math.round(row.avg)} />
                <span className="w-10 text-right text-[11px] font-bold text-slate-700">{row.avg.toFixed(1)}</span>
                <span className="w-16 text-right text-[10px] text-slate-400">
                  {row.count} review{row.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <section>
        <SectionHeading title="All reviews" hint="Newest first" />
        <Panel title="Reviews" description={`${reviewList.length} in total`}>
          {reviewList.length === 0 ? (
            <EmptyState
              icon={Star}
              title="No reviews yet"
              description="A renter can review a machine after a completed rental. Their rating of the machine and of the operator appears here; one review per booking is enforced by the database."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {reviewList.map((r) => {
                const machine = equipmentList.find((e) => e.id === r.equipment_id);
                const booking = bookingList.find((b) => b.id === r.booking_id);
                return (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-forest">
                          {machine?.title ?? "Machine"} · {booking?.renter_name ?? "Renter"}
                        </p>
                        <p className="text-[10.5px] text-slate-500">
                          {booking ? `${formatDate(booking.starts_on)}` : ""} · reviewed{" "}
                          {formatDate(r.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Stars value={r.equipment_rating} />
                        {r.is_reported && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9.5px] font-bold text-amber-800">
                            flagged
                          </span>
                        )}
                      </div>
                    </div>

                    {r.operator_rating != null && (
                      <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-slate-600">
                        Operator <Stars value={r.operator_rating} />
                      </p>
                    )}

                    {r.condition_notes && (
                      <p className="mt-1 text-[10.5px] text-slate-600">
                        <span className="font-semibold">Condition:</span> {r.condition_notes}
                      </p>
                    )}
                    {r.comment && (
                      <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700">
                        {r.comment}
                      </p>
                    )}

                    {!r.is_reported && (
                      <button
                        type="button"
                        onClick={() => {
                          setReportTarget(r);
                          setReason("");
                          setError("");
                        }}
                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:underline"
                      >
                        <Flag className="h-3 w-3" /> Report this review
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>

      <Panel title="How reviews are governed" description="Fair to both sides">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>• Only a renter with a completed booking can review, and only once per booking.</li>
          <li>• A flagged review is not deleted — it is marked so it can be moderated.</li>
          <li>• Reviews cannot be edited or removed by an owner; contact support if one is abusive.</li>
        </ul>
      </Panel>

      <Modal
        open={reportTarget != null}
        onClose={() => setReportTarget(null)}
        title="Report this review"
        subtitle="It stays visible until moderated"
      >
        <div className="space-y-3">
          <Field label="Why are you flagging it?" required hint="Be factual — this is read by a moderator.">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={300}
              className={`${inputClass} resize-none`}
            />
          </Field>
          {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReportTarget(null)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleReport()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              <Flag className="h-3.5 w-3.5" /> {busy ? "Sending…" : "Report"}
            </button>
          </div>
        </div>
      </Modal>
    </EquipmentLayout>
  );
}

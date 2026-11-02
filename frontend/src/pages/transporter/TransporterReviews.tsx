import { useMemo, useState } from "react";
import { Flag, MessageSquareQuote, Star } from "lucide-react";
import TransporterLayout from "@/components/transporter/TransporterLayout";
import { StarRating } from "@/components/worker/ui";
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
  describeTransporterError,
  formatDate,
  listBookings,
  listReviews,
  reportReview,
} from "@/lib/transporter";
import type { TransportBooking, TransportReview } from "@/lib/transporter";

/**
 * Reviews & ratings.
 *
 * Only requester-written reviews are shown as customer feedback. The database
 * refuses a review unless the booking is completed and the reviewer is one of
 * its two parties, so this list cannot be padded from the client.
 */
export default function TransporterReviews() {
  const D = describeTransporterError;
  const reviews = useWorkerData<TransportReview[]>(() => listReviews(), [], D);
  const bookings = useWorkerData<TransportBooking[]>(() => listBookings(), [], D);

  const [reporting, setReporting] = useState<TransportReview | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const all = reviews.data ?? [];
  const fromRequesters = useMemo(
    () => all.filter((r) => r.reviewer_role === "requester"),
    [all]
  );

  const bookingById = useMemo(() => {
    const map = new Map<string, TransportBooking>();
    for (const b of bookings.data ?? []) map.set(b.id, b);
    return map;
  }, [bookings.data]);

  const average =
    fromRequesters.length > 0
      ? fromRequesters.reduce((s, r) => s + r.rating, 0) / fromRequesters.length
      : 0;

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of fromRequesters) counts[r.rating - 1] += 1;
    return counts;
  }, [fromRequesters]);

  const completed = (bookings.data ?? []).filter((b) => b.status === "completed");

  async function handleReport() {
    if (!reporting) return;
    setBusy(true);
    setError("");
    try {
      await reportReview(reporting.id, reason.trim() || "Reported by transporter");
      setDone(true);
      setReporting(null);
      setReason("");
      reviews.reload();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  const loading = reviews.state === "loading";
  const failed = reviews.state === "error" ? reviews : null;

  return (
    <TransporterLayout title="Reviews & Ratings" subtitle="What requesters say about your service">
      {loading && <Loading label="Loading reviews…" />}
      {failed && <ErrorNotice message={failed.error} onRetry={failed.reload} />}

      {!loading && !failed && (
        <>
          {done && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11.5px] font-semibold text-emerald-800">
              Thanks — our team will look at this review.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="grid grid-cols-2 gap-3 lg:col-span-1 lg:grid-cols-1">
              <StatCard
                icon={Star}
                label="Average rating"
                value={fromRequesters.length ? average.toFixed(1) : "—"}
                hint={`${fromRequesters.length} review${fromRequesters.length === 1 ? "" : "s"}`}
              />
              <StatCard
                icon={MessageSquareQuote}
                label="Trips completed"
                value={String(completed.length)}
                hint="Reviewed after completion"
              />
            </section>

            <Panel title="Rating breakdown" description="How requesters have rated you" className="lg:col-span-2">
              <div className="space-y-2 p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="font-display text-3xl font-extrabold text-forest">
                    {fromRequesters.length ? average.toFixed(1) : "—"}
                  </span>
                  <div>
                    <StarRating value={average} size="md" />
                    <p className="text-[10.5px] text-slate-500">
                      {fromRequesters.length} requester review
                      {fromRequesters.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 pt-1">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = distribution[star - 1];
                    const pct = fromRequesters.length ? (count / fromRequesters.length) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-2">
                        <span className="w-3 text-[11px] font-bold text-slate-500">{star}</span>
                        <Star className="h-3 w-3 text-amber-400" />
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-6 text-right text-[10.5px] text-slate-500">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>
          </div>

          <Panel title="Requester feedback" description="Written reviews from finished trips">
            {fromRequesters.length === 0 ? (
              <EmptyState
                icon={MessageSquareQuote}
                title="No reviews yet"
                description="After you complete a trip, the requester can rate your service. Reviews appear here."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {fromRequesters.map((review) => {
                  const booking = bookingById.get(review.booking_id);
                  return (
                    <li key={review.id} className="px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-[12.5px] font-bold text-forest">
                            {booking?.requester_name ?? "Requester"}
                            <StarRating value={review.rating} />
                          </p>
                          <p className="mt-0.5 text-[10.5px] text-slate-500">
                            {booking?.title ? `${booking.title} · ` : ""}
                            {formatDate(review.created_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setError("");
                            setReporting(review);
                          }}
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10.5px] font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Flag className="h-3 w-3" /> Report
                        </button>
                      </div>
                      {review.comment && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-700">
                          {review.comment}
                        </p>
                      )}
                      {review.is_reported && (
                        <p className="mt-1 text-[10.5px] font-semibold text-amber-700">
                          Reported — under review by CenAGRI.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Trip history" description="Completed trips eligible for review">
            {completed.length === 0 ? (
              <EmptyState
                icon={Star}
                title="No completed trips yet"
                description="Once a trip is marked complete, it is added here and the requester can review you."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {completed.map((trip) => (
                  <li key={trip.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-forest">{trip.title}</p>
                      <p className="truncate text-[10.5px] text-slate-500">
                        {trip.requester_name ?? "Requester"} · {formatDate(trip.actual_delivery_at ?? trip.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      Completed
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      <Modal
        open={Boolean(reporting)}
        onClose={() => setReporting(null)}
        title="Report this review"
        subtitle="Tell us why this review should be looked at"
      >
        <div className="space-y-3">
          <Field label="Reason" required>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className={`${inputClass} resize-none`}
              placeholder="e.g. This review is abusive or not about my service."
            />
          </Field>
          {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setReporting(null)}
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
              <Flag className="h-3.5 w-3.5" /> {busy ? "Sending…" : "Report review"}
            </button>
          </div>
        </div>
      </Modal>
    </TransporterLayout>
  );
}

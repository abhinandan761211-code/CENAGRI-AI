import { useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  Lock,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import TransporterLayout from "@/components/transporter/TransporterLayout";
import { InvoiceStatusPill } from "@/components/transporter/ui";
import {
  ErrorNotice,
  Field,
  Loading,
  Modal,
  EmptyState,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  ACCEPTED_DOCUMENT_TYPES,
  DOCUMENT_KIND_LABEL,
  DOCUMENT_KINDS,
  bucketForKind,
  deleteDocument,
  describeTransporterError,
  formatBytes,
  formatDate,
  formatINR,
  listDocuments,
  listFleet,
  listInvoices,
  MAX_DOCUMENT_BYTES,
  signedFileUrl,
  uploadDocument,
  validateDocument,
  vehicleAlerts,
} from "@/lib/transporter";
import type {
  DocumentKind,
  FleetVehicle,
  TransportInvoice,
  TransporterDocument,
} from "@/lib/transporter";

const DOC_LABEL = DOCUMENT_KIND_LABEL;

const DOC_STATUS_STYLE: Record<TransporterDocument["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

/**
 * Invoices & documents.
 *
 * Two sides of the same paperwork: invoices you are owed, and the compliance
 * documents that let you operate. Document files are private — this screen
 * lists what exists and its review state, and never renders a public URL.
 */
export default function TransporterInvoices() {
  const D = describeTransporterError;
  const invoices = useWorkerData<TransportInvoice[]>(() => listInvoices(), [], D);
  const documents = useWorkerData<TransporterDocument[]>(() => listDocuments(), [], D);
  const fleet = useWorkerData<FleetVehicle[]>(() => listFleet(), [], D);

  const [tab, setTab] = useState<"invoices" | "documents">("invoices");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [docKind, setDocKind] = useState<DocumentKind>("business_registration");
  const [docVehicle, setDocVehicle] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [opening, setOpening] = useState("");

  const invoiceList = invoices.data ?? [];
  const docList = documents.data ?? [];
  const vehicles = fleet.data ?? [];

  const vehicleDocs = useMemo(() => {
    const items: { label: string; value: string; alert: boolean }[] = [];
    for (const v of vehicles) {
      const tag = v.registration_no ?? v.vehicle_type ?? "Vehicle";
      const alerts = vehicleAlerts(v);
      items.push({
        label: `Insurance · ${tag}`,
        value: formatDate(v.insurance_valid_till),
        alert: alerts.some((a) => a.kind === "insurance"),
      });
      items.push({
        label: `Fitness · ${tag}`,
        value: formatDate(v.fitness_valid_till),
        alert: alerts.some((a) => a.kind === "fitness"),
      });
      if (v.permit_no) {
        items.push({
          label: `Permit · ${tag}`,
          value: `${v.permit_no} · ${formatDate(v.permit_valid_till)}`,
          alert: alerts.some((a) => a.kind === "permit"),
        });
      }
    }
    return items;
  }, [vehicles]);

  function downloadInvoice(invoice: TransportInvoice) {
    // A printable statement rather than a hidden PDF generator: honest about
    // what it is, and works without a backend round trip.
    const lines = [
      "CenAGRI AI — Transporter invoice",
      "",
      `Invoice: ${invoice.invoice_no}`,
      `Issued: ${formatDate(invoice.issued_on)}`,
      `Due: ${invoice.due_on ? formatDate(invoice.due_on) : "—"}`,
      `Status: ${invoice.status}`,
      `Amount: ${formatINR(Number(invoice.amount_inr))}`,
      invoice.reference ? `Reference: ${invoice.reference}` : "",
      "",
      "This statement is generated from your CenAGRI records.",
    ].filter(Boolean);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoice_no}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const loading = invoices.state === "loading" || documents.state === "loading";
  const failed =
    invoices.state === "error" ? invoices : documents.state === "error" ? documents : null;

  async function handleUpload() {
    if (!docFile) {
      setFormError("Choose a file to upload.");
      return;
    }
    const invalid = validateDocument(docFile);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await uploadDocument({
        file: docFile,
        kind: docKind,
        vehicle_id: docVehicle || null,
      });
      setUploadOpen(false);
      setDocFile(null);
      setDocVehicle("");
      documents.reload();
    } catch (err) {
      setFormError(D(err));
    } finally {
      setBusy(false);
    }
  }

  /** Open a private file through a 60-second signed URL. */
  async function openDocument(doc: TransporterDocument) {
    setOpening(doc.id);
    setFormError("");
    try {
      const url = await signedFileUrl(doc.document_url, bucketForKind(doc.kind));
      if (!url) {
        setFormError("That file could not be opened. It may have been removed from storage.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setFormError(D(err));
    } finally {
      setOpening("");
    }
  }

  async function handleDelete(doc: TransporterDocument) {
    setFormError("");
    try {
      await deleteDocument(doc);
      documents.reload();
    } catch (err) {
      setFormError(D(err));
    }
  }

  return (
    <TransporterLayout title="Invoices & Documents" subtitle="Payment paperwork and vehicle compliance">
      {loading && <Loading label="Loading documents…" />}
      {failed && <ErrorNotice message={failed.error} onRetry={failed.reload} />}

      {!loading && !failed && (
        <>
          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
            {(["invoices", "documents"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold capitalize transition ${tab === key
                    ? "bg-brand-700 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
              >
                {key}
                <span className={`ml-1.5 text-[10px] ${tab === key ? "text-white/70" : "text-slate-400"}`}>
                  {key === "invoices" ? invoiceList.length : docList.length + vehicleDocs.length}
                </span>
              </button>
            ))}
          </div>

          {tab === "invoices" && (
            <Panel title="Invoices" description="Issued for completed trips">
              {invoiceList.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No invoices yet"
                  description="An invoice is issued after a trip is completed and delivery is confirmed by the requester."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {invoiceList.map((invoice) => (
                    <li key={invoice.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11.5px] font-semibold text-forest">
                          {invoice.invoice_no}
                        </p>
                        <p className="text-[10.5px] text-slate-500">
                          Issued {formatDate(invoice.issued_on)}
                          {invoice.due_on ? ` · due ${formatDate(invoice.due_on)}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12.5px] font-bold text-forest">
                        {formatINR(Number(invoice.amount_inr))}
                      </span>
                      <InvoiceStatusPill status={invoice.status} />
                      <button
                        type="button"
                        onClick={() => downloadInvoice(invoice)}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="h-3 w-3" /> Download
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {tab === "documents" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title="Uploaded documents"
                description="Reviewed by the CenAGRI team"
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setFormError("");
                      setDocFile(null);
                      setUploadOpen(true);
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-700 px-2.5 text-[11.5px] font-semibold text-white hover:bg-brand-800"
                  >
                    <Upload className="h-3 w-3" /> Upload
                  </button>
                }
              >
                {formError && !uploadOpen && (
                  <p className="border-b border-slate-100 px-4 py-2 text-[11px] font-semibold text-rose-600">
                    {formError}
                  </p>
                )}
                {docList.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
                    No documents uploaded yet. Add your business registration, RC, insurance and
                    permit so the team can verify you.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {docList.map((doc) => (
                      <li key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                        <FileCheck2 className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-forest">
                            {DOC_LABEL[doc.kind]}
                          </p>
                          <p className="text-[10.5px] text-slate-500">{formatDate(doc.created_at)}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${DOC_STATUS_STYLE[doc.status]}`}
                        >
                          {doc.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => void openDocument(doc)}
                          disabled={opening === doc.id}
                          title="Open this file"
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {opening === doc.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3 w-3" />
                          )}
                          Open
                        </button>
                        {doc.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(doc)}
                            title="Remove before it is reviewed"
                            aria-label={`Remove ${DOC_LABEL[doc.kind]}`}
                            className="shrink-0 rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-[10.5px] text-slate-500">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                  Files are stored privately. Only you and an authorised CenAGRI reviewer can open them.
                </div>
              </Panel>

              <Panel title="Vehicle compliance" description="What must stay valid to operate">
                {vehicleDocs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[11.5px] text-slate-500">
                    Add a vehicle to see its insurance, fitness and permit dates.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {vehicleDocs.map((item) => (
                      <li key={item.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="min-w-0 truncate text-[11.5px] font-semibold text-slate-700">
                          {item.label}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${item.alert ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
                            }`}
                        >
                          {item.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Driver licences" description="Kept private; expiry tracked here">
                <div className="flex items-start gap-2 p-4 text-[11.5px] leading-relaxed text-slate-600">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  Licence numbers and expiry dates are on the Driver Management page. The uploaded
                  document itself is never shown to other users.
                </div>
              </Panel>

              <Panel title="Why this matters" description="Compliance keeps bookings valid">
                <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600">
                  <li className="flex gap-1.5">
                    <Truck className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                    An expired insurance or fitness certificate puts the vehicle out of compliance.
                  </li>
                  <li className="flex gap-1.5">
                    <Truck className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                    The fleet page warns you 30 days before any document expires.
                  </li>
                </ul>
              </Panel>
            </div>
          )}
        </>
      )}

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload a document"
        subtitle="Stored privately and sent for review"
      >
        <div className="space-y-3">
          <Field label="What is this document?" required>
            <select
              value={docKind}
              onChange={(e) => setDocKind(e.target.value as DocumentKind)}
              className={inputClass}
            >
              {DOCUMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {DOC_LABEL[kind]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Which vehicle?"
            hint="Optional — pick one so the reviewer knows which truck the paper belongs to."
          >
            <select
              value={docVehicle}
              onChange={(e) => setDocVehicle(e.target.value)}
              className={inputClass}
            >
              <option value="">Not vehicle specific</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registration_no ?? v.vehicle_type ?? "Vehicle"}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="File"
            required
            hint={`JPG, PNG, WebP or PDF · up to ${formatBytes(MAX_DOCUMENT_BYTES)}`}
          >
            <input
              type="file"
              accept={ACCEPTED_DOCUMENT_TYPES}
              onChange={(e) => {
                setFormError("");
                setDocFile(e.target.files?.[0] ?? null);
              }}
              className="block w-full text-[11.5px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-1.5 file:text-[11.5px] file:font-semibold file:text-white hover:file:bg-brand-800"
            />
          </Field>

          {docFile && (
            <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
              {docFile.name} · {formatBytes(docFile.size)}
            </p>
          )}

          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-amber-900">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            Uploading a document does not verify you by itself. A CenAGRI reviewer checks it, and only
            then does your verification status change.
          </p>

          {formError && <p className="text-[11.5px] font-semibold text-rose-600">{formError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setUploadOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {busy ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </div>
      </Modal>
    </TransporterLayout>
  );
}

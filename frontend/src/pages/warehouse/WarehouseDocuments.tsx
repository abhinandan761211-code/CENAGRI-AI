import { useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Layers,
  Loader2,
  Lock,
  Trash2,
  Upload,
} from "lucide-react";
import WarehouseLayout from "@/components/warehouse/WarehouseLayout";
import { VerificationBadge } from "@/components/warehouse/ui";
import {
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  ACCEPTED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  WAREHOUSE_DOCUMENT_KINDS,
  WAREHOUSE_DOCUMENT_LABEL,
  deleteDocument,
  describeWarehouseError,
  formatBytes,
  formatDate,
  formatINR,
  listDocuments,
  listInvoices,
  listWarehouses,
  signedFileUrl,
  uploadDocument,
  validateDocument,
} from "@/lib/warehouse";
import type {
  StorageInvoice,
  Warehouse,
  WarehouseDocument,
  WarehouseDocumentKind,
} from "@/lib/warehouse";

const DOC_STATUS_STYLE: Record<WarehouseDocument["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  expired: "bg-orange-100 text-orange-800",
};

/**
 * Invoices & Documents.
 *
 * Two kinds of paperwork: invoices CenAGRI issued to you, and the compliance
 * documents that let you operate. Files go to the private bucket and only the
 * object path is stored — the list never renders a public URL.
 *
 * Uploading a document does NOT make you compliant. It puts it in front of a
 * reviewer, and the badge stays "Pending review" until they decide.
 */
export default function WarehouseDocuments() {
  const D = describeWarehouseError;
  const invoices = useWorkerData<StorageInvoice[]>(() => listInvoices(), [], D);
  const documents = useWorkerData<WarehouseDocument[]>(() => listDocuments(), [], D);
  const warehouses = useWorkerData<Warehouse[]>(() => listWarehouses(), [], D);

  const [tab, setTab] = useState<"invoices" | "documents">("documents");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [kind, setKind] = useState<WarehouseDocumentKind>("ownership_proof");
  const [warehouseId, setWarehouseId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [opening, setOpening] = useState("");

  const invoiceList = invoices.data ?? [];
  const docList = documents.data ?? [];
  const warehouseList = warehouses.data ?? [];

  const byKind = useMemo(() => {
    const map = new Map<WarehouseDocumentKind, WarehouseDocument>();
    for (const doc of docList) {
      const current = map.get(doc.kind);
      if (!current || doc.created_at > current.created_at) map.set(doc.kind, doc);
    }
    return map;
  }, [docList]);

  function downloadInvoice(invoice: StorageInvoice) {
    const lines = [
      "CenAGRI AI — Storage invoice",
      "",
      `Invoice: ${invoice.invoice_no}`,
      `Issued: ${formatDate(invoice.issued_on)}`,
      `Due: ${invoice.due_on ? formatDate(invoice.due_on) : "—"}`,
      `Status: ${invoice.status}`,
      `Amount: ${formatINR(Number(invoice.amount_inr))}`,
      `Tax: ${formatINR(Number(invoice.tax_inr))}`,
      `Total: ${formatINR(Number(invoice.total_inr))}`,
      invoice.reference ? `Reference: ${invoice.reference}` : "",
      "",
      "Generated from your CenAGRI records.",
    ].filter(Boolean);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoice_no}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload() {
    if (!file) {
      setFormError("Choose a file to upload.");
      return;
    }
    const invalid = validateDocument(file);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await uploadDocument({ file, kind, warehouse_id: warehouseId || null });
      setUploadOpen(false);
      setFile(null);
      documents.reload();
    } catch (err) {
      setFormError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(doc: WarehouseDocument) {
    setOpening(doc.id);
    setFormError("");
    try {
      const url = await signedFileUrl(doc.document_url);
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

  async function handleDelete(doc: WarehouseDocument) {
    setFormError("");
    try {
      await deleteDocument(doc);
      documents.reload();
    } catch (err) {
      setFormError(D(err));
    }
  }

  const loading = invoices.state === "loading" || documents.state === "loading";

  if (loading) {
    return (
      <WarehouseLayout title="Invoices & Documents">
        <Loading label="Loading paperwork…" />
      </WarehouseLayout>
    );
  }

  return (
    <WarehouseLayout
      title="Invoices & Documents"
      subtitle="Payment records and compliance paperwork"
    >
      {formError && !uploadOpen && <ErrorNotice message={formError} />}

      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {(["documents", "invoices"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold capitalize transition ${
              tab === key
                ? "bg-brand-700 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {key}
            <span className={`ml-1.5 text-[10px] ${tab === key ? "text-white/70" : "text-slate-400"}`}>
              {key === "invoices" ? invoiceList.length : docList.length}
            </span>
          </button>
        ))}
      </div>

      {tab === "documents" && (
        <>
          <Panel
            title="Verification documents"
            description="Uploaded paperwork and its review state"
            action={
              <button
                type="button"
                onClick={() => {
                  setFormError("");
                  setFile(null);
                  setUploadOpen(true);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-700 px-2.5 text-[11.5px] font-semibold text-white hover:bg-brand-800"
              >
                <Upload className="h-3 w-3" /> Upload
              </button>
            }
          >
            {docList.length === 0 ? (
              <EmptyState
                icon={FileCheck2}
                title="No documents uploaded"
                description="Ownership proof, registration or licence, fire safety and insurance keep your listing credible. Uploading does not by itself establish legal compliance — a CenAGRI reviewer checks each file."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {docList.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <FileCheck2 className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-forest">
                        {WAREHOUSE_DOCUMENT_LABEL[doc.kind]}
                      </p>
                      <p className="text-[10.5px] text-slate-500">
                        {formatDate(doc.created_at)}
                        {doc.expires_on ? ` · expires ${formatDate(doc.expires_on)}` : ""}
                        {warehouseList.find((w) => w.id === doc.warehouse_id)?.name
                          ? ` · ${warehouseList.find((w) => w.id === doc.warehouse_id)?.name}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${DOC_STATUS_STYLE[doc.status]}`}
                    >
                      {doc.status === "pending" ? "pending review" : doc.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => void openDocument(doc)}
                      disabled={opening === doc.id}
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
                        aria-label="Remove document"
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
              Files are stored privately. Only you and an authorised reviewer can open them.
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Checklist" description="What a complete file looks like">
              <ul className="divide-y divide-slate-100">
                {WAREHOUSE_DOCUMENT_KINDS.filter((k) => k !== "other" && k !== "facility_photo").map((k) => {
                  const doc = byKind.get(k);
                  return (
                    <li key={k} className="flex items-center justify-between gap-2 px-4 py-2">
                      <span className="text-[11.5px] font-semibold text-slate-700">
                        {WAREHOUSE_DOCUMENT_LABEL[k]}
                      </span>
                      {doc ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${DOC_STATUS_STYLE[doc.status]}`}
                        >
                          {doc.status === "pending" ? "pending" : doc.status}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          not submitted
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel title="What verification means" description="Honest about the limits">
              <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600">
                <li>• A reviewer checks that the file matches the warehouse and is not expired.</li>
                <li>• Verification is a CenAGRI badge, not a government licence.</li>
                <li>• You remain responsible for the actual licences your facility needs.</li>
                <li>• An expired document shows as <strong>Expired</strong>; upload the renewal to restore it.</li>
              </ul>
              <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-3">
                {warehouseList.slice(0, 4).map((w) => (
                  <span key={w.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-0.5">
                    <span className="text-[10.5px] font-semibold text-slate-600">{w.name}</span>
                    <VerificationBadge state={w.verification} />
                  </span>
                ))}
                {warehouseList.length === 0 && (
                  <span className="text-[10.5px] text-slate-400">No warehouse yet.</span>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}

      {tab === "invoices" && (
        <Panel title="Invoices" description="Issued by CenAGRI after a release">
          {invoiceList.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No invoices yet"
              description="An invoice is issued after goods are released and delivery is confirmed."
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
                    {formatINR(Number(invoice.total_inr))}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                      invoice.status === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : invoice.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {invoice.status}
                  </span>
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

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload a document"
        subtitle="Stored privately and sent for review"
      >
        <div className="space-y-3">
          <Field label="Document type" required>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as WarehouseDocumentKind)}
              className={inputClass}
            >
              {WAREHOUSE_DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {WAREHOUSE_DOCUMENT_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Which warehouse?" hint="Optional — leave blank for an account-level document.">
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
              <option value="">Account level</option>
              {warehouseList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="File" required hint={`JPG, PNG, WebP or PDF · up to ${formatBytes(MAX_DOCUMENT_BYTES)}`}>
            <input
              type="file"
              accept={ACCEPTED_DOCUMENT_TYPES}
              onChange={(e) => {
                setFormError("");
                setFile(e.target.files?.[0] ?? null);
              }}
              className="block w-full text-[11.5px] text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-3 file:py-1.5 file:text-[11.5px] file:font-semibold file:text-white hover:file:bg-brand-800"
            />
          </Field>

          {file && (
            <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
              {file.name} · {formatBytes(file.size)}
            </p>
          )}

          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-amber-900">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            Uploading does not verify you. A CenAGRI reviewer checks the file, and only then does the
            status change.
          </p>

          {formError && <p className="text-[11.5px] font-semibold text-rose-600">{formError}</p>}

          <div className="flex justify-end gap-2">
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
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
              {busy ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </div>
      </Modal>
    </WarehouseLayout>
  );
}

import { useMemo, useState } from "react";
import {
  ExternalLink,
  FileCheck2,
  Loader2,
  Lock,
  Trash2,
  Upload,
} from "lucide-react";
import EquipmentLayout from "@/components/equipment/EquipmentLayout";
import { VerificationBadge, SectionHeading } from "@/components/equipment/ui";
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
  DOCUMENT_KINDS,
  DOCUMENT_LABEL,
  MAX_DOCUMENT_BYTES,
  deleteDocument,
  describeEquipmentError,
  formatBytes,
  formatDate,
  listDocuments,
  listEquipment,
  signedFileUrl,
  uploadDocument,
  validateDocument,
} from "@/lib/equipment";
import type {
  DocumentKind,
  Equipment,
  EquipmentDocument,
  VerificationState,
} from "@/lib/equipment";

const STATUS_STYLE: Record<EquipmentDocument["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  expired: "bg-orange-100 text-orange-800",
};

/**
 * Documents & Verification.
 *
 * Files are uploaded to a private bucket and only the object path is stored, so
 * nothing here can produce a public link. Uploading puts a file in front of a
 * reviewer — it does not make the machine compliant, and the badge says so.
 */
export default function EquipmentDocuments() {
  const D = describeEquipmentError;
  const documents = useWorkerData<EquipmentDocument[]>(() => listDocuments(), [], D);
  const equipment = useWorkerData<Equipment[]>(() => listEquipment(), [], D);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DocumentKind>("registration");
  const [equipmentId, setEquipmentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [opening, setOpening] = useState("");

  const docList = documents.data ?? [];
  const equipmentList = equipment.data ?? [];

  const byEquipment = useMemo(() => {
    const map = new Map<string, EquipmentDocument[]>();
    for (const doc of docList) {
      const key = doc.equipment_id ?? "account";
      const rows = map.get(key) ?? [];
      rows.push(doc);
      map.set(key, rows);
    }
    return map;
  }, [docList]);

  /** Worst state per machine, so the summary is honest rather than optimistic. */
  function verificationFor(equipmentIdValue: string): VerificationState {
    const docs = byEquipment.get(equipmentIdValue) ?? [];
    if (docs.length === 0) return "not_submitted";
    if (docs.some((d) => d.status === "expired")) return "expired";
    if (docs.some((d) => d.status === "rejected")) return "rejected";
    if (docs.some((d) => d.status === "pending")) return "pending";
    return "verified";
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
      await uploadDocument({ file, kind, equipment_id: equipmentId || null });
      setOpen(false);
      setFile(null);
      documents.reload();
    } catch (err) {
      setFormError(D(err));
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(doc: EquipmentDocument) {
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

  async function removeDoc(doc: EquipmentDocument) {
    setFormError("");
    try {
      await deleteDocument(doc);
      documents.reload();
    } catch (err) {
      setFormError(D(err));
    }
  }

  if (documents.state === "loading") {
    return (
      <EquipmentLayout title="Documents & Verification">
        <Loading label="Loading documents…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout
      title="Documents & Verification"
      subtitle="Registration, insurance and licences"
      action={
        <button
          type="button"
          onClick={() => {
            setFormError("");
            setFile(null);
            setOpen(true);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          <Upload className="h-3.5 w-3.5" /> Upload document
        </button>
      }
    >
      {documents.state === "error" && <ErrorNotice message={documents.error} onRetry={documents.reload} />}
      {formError && !open && <ErrorNotice message={formError} />}

      <Panel title="Verification by machine" description="The weakest document decides the badge">
        {equipmentList.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title="No machine registered"
            description="Documents are attached per machine. Add one first, then upload its RC, insurance and fitness papers."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {equipmentList.map((e) => {
              const docs = byEquipment.get(e.id) ?? [];
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">{e.title}</p>
                    <p className="text-[10.5px] text-slate-500">
                      {docs.length} document(s)
                      {e.registration_no ? ` · ${e.registration_no}` : ""}
                    </p>
                  </div>
                  <VerificationBadge state={verificationFor(e.id)} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <section>
        <SectionHeading title="Uploaded documents" hint="Private storage — signed links only" />
        <Panel title="All documents" description={`${docList.length} file(s)`}>
          {docList.length === 0 ? (
            <EmptyState
              icon={FileCheck2}
              title="No documents uploaded"
              description="Registration, RC, insurance, fitness and operator licences keep your listing credible. Uploading does not by itself establish legal compliance — a Kalika reviewer checks each file."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {docList.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <FileCheck2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-forest">{DOCUMENT_LABEL[doc.kind]}</p>
                    <p className="text-[10.5px] text-slate-500">
                      {formatDate(doc.created_at)}
                      {doc.expires_on ? ` · expires ${formatDate(doc.expires_on)}` : ""}
                      {doc.equipment_id
                        ? ` · ${equipmentList.find((e) => e.id === doc.equipment_id)?.title ?? ""}`
                        : " · account level"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${STATUS_STYLE[doc.status]}`}
                  >
                    {doc.status === "pending" ? "pending review" : doc.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => void openDoc(doc)}
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
                      onClick={() => void removeDoc(doc)}
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
            Files are stored privately. Only you and an authorised Kalika reviewer can open them.
          </div>
        </Panel>
      </section>

      <Panel title="What verification means" description="Honest about the limits">
        <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
          <li>• A reviewer checks that the document matches the machine and has not expired.</li>
          <li>• Verification is a Kalika badge, not a government certificate.</li>
          <li>• You remain responsible for every licence your machine legally needs.</li>
          <li>• An expired document shows as <strong>Expired</strong>; upload the renewal to restore it.</li>
          <li>• Operator licence photographs belong here too, and are never shown to a renter.</li>
        </ul>
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Upload a document"
        subtitle="Stored privately and sent for review"
      >
        <div className="space-y-3">
          <Field label="Document type" required>
            <select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)} className={inputClass}>
              {DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOCUMENT_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Which machine?" hint="Optional — leave blank for an account-level document.">
            <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className={inputClass}>
              <option value="">Account level</option>
              {equipmentList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
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
            Uploading does not verify the machine. A reviewer checks the file before the status changes.
          </p>

          {formError && <p className="text-[11.5px] font-semibold text-rose-600">{formError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
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
    </EquipmentLayout>
  );
}

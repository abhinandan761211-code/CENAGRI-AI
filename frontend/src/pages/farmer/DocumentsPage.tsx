import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Clock,
  ExternalLink,
  FileText,
  HelpCircle,
  Lock,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  LoadingRows,
  Modal,
  PageHeader,
  Panel,
  PrimaryButton,
  Select,
  shortDate,
  Stat,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/i18n/LanguageContext";
import type { TranslationKey } from "@/i18n/locales/en";
import {
  ACCEPTED_DOCUMENT_TYPES,
  DOCUMENT_KINDS,
  deleteDocument,
  documentUrl,
  farmerError,
  label,
  listDocuments,
  MAX_DOCUMENT_BYTES,
  uploadDocument,
} from "@/lib/farmer";
import type { DocumentKind, FarmerDocument } from "@/lib/farmer";

/**
 * My Documents & KYC.
 *
 * Uploads go to a private Supabase bucket (`farmer-documents`) under the
 * user's own folder, and a row is written to `farmer_documents`. Viewing opens
 * a 5-minute signed URL — the file is never public.
 *
 * Verification status is whatever the review team set; the page never shows
 * "verified" because a file was uploaded.
 */

const REQUIRED: { kind: DocumentKind; whyKey: TranslationKey }[] = [
  { kind: "aadhaar", whyKey: "acc.doc.whyAadhaar" },
  { kind: "land_record", whyKey: "acc.doc.whyLand" },
  { kind: "bank_passbook", whyKey: "acc.doc.whyBank" },
];

const STATUS_META: Record<
  FarmerDocument["status"],
  { tone: "green" | "amber" | "red"; icon: typeof BadgeCheck; labelKey: TranslationKey }
> = {
  verified: { tone: "green", icon: BadgeCheck, labelKey: "acc.doc.statusVerified" },
  pending: { tone: "amber", icon: Clock, labelKey: "acc.doc.statusPending" },
  rejected: { tone: "red", icon: XCircle, labelKey: "acc.doc.statusRejected" },
};

export default function DocumentsPage() {
  const { user } = useAuth();
  const { toast, showToast } = useToast();
  const { t, tf } = useLang();

  const [documents, setDocuments] = useState<FarmerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [kind, setKind] = useState<DocumentKind>("aadhaar");
  const [labelText, setLabelText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<FarmerDocument | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDocuments(await listDocuments());
    } catch (err) {
      setError(farmerError(err, t("acc.doc.errLoad")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const progress = REQUIRED.filter((req) => documents.some((d) => d.kind === req.kind));

  async function upload() {
    if (!file) {
      setFormError(t("acc.doc.errNoFile"));
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setFormError(t("acc.doc.errSize"));
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const doc = await uploadDocument(file, kind, labelText);
      setDocuments((prev) => [doc, ...prev]);
      setUploadOpen(false);
      setFile(null);
      setLabelText("");
      showToast(t("acc.doc.uploaded"));
    } catch (err) {
      setFormError(farmerError(err, t("acc.doc.errUpload")));
    } finally {
      setBusy(false);
    }
  }

  async function open(doc: FarmerDocument) {
    try {
      const url = await documentUrl(doc.file_path);
      if (!url) throw new Error("This file could not be opened.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(farmerError(err, t("acc.doc.errOpen")));
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteDocument(confirmDelete.id, confirmDelete.file_path);
      setDocuments((prev) => prev.filter((d) => d.id !== confirmDelete.id));
      setConfirmDelete(null);
      showToast(t("acc.doc.removed"));
    } catch (err) {
      setError(farmerError(err, t("acc.doc.errDelete")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FarmerShell>
      <PageHeader
        icon={FileText}
        title={t("acc.doc.title")}
        description={t("acc.doc.desc")}
        meta={<Chip tone="green" icon={Lock}>{t("acc.doc.private")}</Chip>}
        actions={
          <PrimaryButton onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" /> {t("acc.doc.upload")}
          </PrimaryButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("acc.doc.statDocs")} value={documents.length} icon={FileText} hint={t("acc.doc.statDocsHint")} />
        <Stat label={t("acc.doc.statVerified")} value={documents.filter((d) => d.status === "verified").length} icon={BadgeCheck} tone="green" hint={t("acc.doc.statVerifiedHint")} />
        <Stat label={t("acc.doc.statPending")} value={documents.filter((d) => d.status === "pending").length} icon={Clock} tone="amber" hint={t("acc.doc.statPendingHint")} />
        <Stat label={t("acc.doc.statRequired")} value={`${progress.length}/3`} icon={ShieldCheck} tone={progress.length === 3 ? "green" : "blue"} hint={t("acc.doc.statRequiredHint")} />
      </div>

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
          {t("acc.doc.privacyNote")}
        </p>
      </div>

      <Panel title={t("acc.doc.required")} icon={ShieldCheck}>
        <ul className="divide-y divide-slate-100">
          {REQUIRED.map((req) => {
            const doc = documents.find((d) => d.kind === req.kind);
            return (
              <li key={req.kind} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${doc ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-400"
                    }`}
                >
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-forest">{label(req.kind)}</p>
                  <p className="text-[11px] text-slate-500">{t(req.whyKey)}</p>
                </div>
                {doc ? (
                  <Chip tone={STATUS_META[doc.status].tone}>{t(STATUS_META[doc.status].labelKey)}</Chip>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setKind(req.kind);
                      setUploadOpen(true);
                    }}
                    className="text-[11px] font-bold text-brand-700 hover:underline"
                  >
                    {t("acc.doc.uploadAction")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title={t("acc.doc.all")} description={t("acc.doc.newestFirst")} icon={FileText}>
        {loading ? (
          <LoadingRows rows={3} />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("acc.doc.none")}
            body={t("acc.doc.noneBody")}
            action={
              <PrimaryButton onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4" /> {t("acc.doc.upload")}
              </PrimaryButton>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((doc) => {
              const meta = STATUS_META[doc.status];
              const StatusIcon = meta.icon;
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-brand-700">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-forest">
                      {doc.label || label(doc.kind)}
                      <Chip tone={meta.tone} icon={StatusIcon}>
                        {t(meta.labelKey)}
                      </Chip>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {label(doc.kind)} · {tf("acc.doc.uploadedOn", { date: shortDate(doc.created_at) })}
                      {doc.size_bytes ? ` · ${(doc.size_bytes / 1024 / 1024).toFixed(1)} MB` : ""}
                    </p>
                    {doc.status === "rejected" && doc.review_note && (
                      <p className="mt-1 text-[11px] text-rose-700">{tf("acc.doc.reason", { note: doc.review_note })}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <GhostButton className="h-8 px-2.5 text-[11px]" onClick={() => void open(doc)}>
                      <ExternalLink className="h-3 w-3" /> {t("acc.doc.open")}
                    </GhostButton>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(doc)}
                      aria-label={t("acc.doc.deleteAria")}
                      className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-400">
        <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" />
        {t("acc.doc.footer")}
      </p>

      {uploadOpen && (
        <Modal
          title={t("acc.doc.uploadTitle")}
          description={t("acc.doc.uploadDesc")}
          onClose={() => setUploadOpen(false)}
          footer={
            <>
              <GhostButton onClick={() => setUploadOpen(false)}>{t("acc.mgmt.cancel")}</GhostButton>
              <PrimaryButton onClick={() => void upload()} disabled={busy}>
                {busy ? t("acc.doc.uploading") : t("acc.doc.uploadAction")}
              </PrimaryButton>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.doc.docType")}
              </span>
              <Select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                {DOCUMENT_KINDS.map((d) => (
                  <option key={d} value={d}>
                    {label(d)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("acc.doc.shortLabel")}
              </span>
              <input
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                placeholder={t("acc.doc.shortLabelPlaceholder")}
                maxLength={80}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("acc.doc.file")}</span>
              <input
                type="file"
                accept={ACCEPTED_DOCUMENT_TYPES}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
              />
            </label>
            {formError && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}
            <p className="text-[10px] text-slate-400">{t("acc.doc.confirmOwn")}</p>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title={t("acc.doc.deleteTitle")}
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <GhostButton onClick={() => setConfirmDelete(null)}>{t("acc.doc.keepIt")}</GhostButton>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="h-9 rounded-lg bg-rose-600 px-3.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {t("acc.delete")}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            {tf("acc.doc.willRemove", { name: confirmDelete.label || label(confirmDelete.kind) })}
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            {t("acc.doc.reuploadNote")}{" "}
            <Link to="/account/help" className="font-semibold text-brand-700 hover:underline">
              {t("acc.doc.needHelp")}
            </Link>
          </p>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}

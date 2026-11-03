import { useState } from "react";
import { FileKey, ShieldCheck, XCircle } from "lucide-react";
import AdminLayout, { NoAccess } from "@/components/admin/AdminLayout";
import { useAdmin, useAdminData } from "@/components/admin/AdminProvider";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  Empty,
  ErrorNotice,
  Field,
  inputClass,
  Loading,
  Pager,
  Panel,
  toneFor,
} from "@/components/admin/ui";
import type { Column } from "@/components/admin/ui";
import { adminFetch } from "@/lib/admin/api";
import type { Page } from "@/lib/admin/api";

type KycRequest = {
  id: string;
  user_id: string;
  account_type: string | null;
  document_type: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  applicant: { id: string; full_name: string | null; email: string | null; role: string | null };
};

/**
 * KYC & verification.
 *
 * The document itself is never rendered from a stored URL: "Open document" asks
 * the API for a signed link that dies in five minutes, and every issue is
 * audited. A reviewer therefore cannot copy a permanent link to someone's ID.
 */
export default function AdminKyc() {
  const { can } = useAdmin();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<KycRequest | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading, error, reload } = useAdminData(
    () => adminFetch<Page<KycRequest>>("/kyc", { query: { status, page, page_size: 25 } }),
    [status, page]
  );

  if (!can("kyc.view")) {
    return (
      <AdminLayout title="KYC & verification">
        <NoAccess module="identity verification" />
      </AdminLayout>
    );
  }

  async function openDocument(request: KycRequest) {
    setDocError(null);
    try {
      const res = await adminFetch<{ url: string }>(`/kyc/${request.id}/document`);
      window.open(res.url, "_blank", "noopener,noreferrer");
      setNotice("Signed document link opened (valid for 5 minutes). Access was logged.");
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Could not open the document.");
    }
  }

  const columns: Column<KycRequest>[] = [
    {
      key: "applicant",
      header: "Applicant",
      render: (row) => (
        <div>
          <p className="text-[12.5px] font-semibold text-slate-800">{row.applicant?.full_name ?? "Unnamed"}</p>
          <p className="text-[11px] text-slate-500">{row.applicant?.email}</p>
        </div>
      ),
    },
    { key: "role", header: "Account", render: (row) => <Badge tone="sky">{row.applicant?.role ?? row.account_type ?? "—"}</Badge> },
    { key: "doc", header: "Document", render: (row) => <span className="uppercase text-[11.5px]">{row.document_type}</span> },
    { key: "status", header: "Status", render: (row) => <Badge tone={toneFor(row.status)}>{row.status}</Badge> },
    {
      key: "submitted",
      header: "Submitted",
      render: (row) => <span className="text-[11.5px] text-slate-600">{new Date(row.created_at).toLocaleDateString("en-IN")}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" className="h-7 px-2 text-[11px]" icon={FileKey} onClick={() => void openDocument(row)}>
            Document
          </Button>
          {row.status === "pending" && can("kyc.review") && (
            <Button className="h-7 px-2 text-[11px]" onClick={() => setTarget(row)}>
              Review
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AdminLayout
      title="KYC & verification"
      subtitle="Identity checks with restricted document access and a recorded decision trail"
      badges={{ kyc: data?.total ?? null }}
    >
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">{notice}</div>}
      {(error || docError) && <ErrorNotice message={error ?? docError ?? ""} onRetry={reload} />}

      <div className="flex gap-1.5">
        {(["pending", "approved", "rejected"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setPage(1);
              setStatus(value);
            }}
            className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold capitalize transition ${status === value ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
          >
            {value}
          </button>
        ))}
      </div>

      <Panel title="Verification requests" description="Newest applications first" flush>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.rows ?? []}
              rowKey={(row) => row.id}
              empty={<Empty icon={ShieldCheck} title="No requests here" description="Nothing is waiting in this queue." />}
            />
            {(data?.rows.length ?? 0) > 0 && (
              <Pager page={page} pageSize={25} total={data?.total ?? null} onPage={setPage} />
            )}
          </>
        )}
      </Panel>

      {target && (
        <DecisionDialog
          request={target}
          onClose={() => setTarget(null)}
          onDone={(text) => {
            setTarget(null);
            setNotice(text);
            reload();
          }}
        />
      )}
    </AdminLayout>
  );
}

function DecisionDialog({
  request,
  onClose,
  onDone,
}: {
  request: KycRequest;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = decision === "approve" || reason.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/kyc/${request.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: reason.trim() || null }),
      });
      onDone(`${request.applicant?.full_name ?? "The applicant"} was ${decision === "approve" ? "approved" : "rejected"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The decision was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title="Review verification"
      subtitle={`${request.applicant?.full_name ?? "Applicant"} · ${request.document_type}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={decision === "approve" ? "primary" : "danger"}
            icon={decision === "approve" ? ShieldCheck : XCircle}
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : decision === "approve" ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}
      <Field label="Decision">
        <select value={decision} onChange={(e) => setDecision(e.target.value as "approve" | "reject")} className={inputClass}>
          <option value="approve">Approve — documents check out</option>
          <option value="reject">Reject — document invalid or unclear</option>
        </select>
      </Field>
      <div className="mt-3">
        <Field label="Reason" hint={decision === "approve" ? "Optional" : "Required — shown to the applicant."}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputClass} maxLength={500} />
        </Field>
      </div>
    </Dialog>
  );
}

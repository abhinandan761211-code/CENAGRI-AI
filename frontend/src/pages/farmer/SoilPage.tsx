import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Beaker,
  ExternalLink,
  FileUp,
  FlaskConical,
  Layers,
  Plus,
  Trash2,
} from "lucide-react";

import FarmerShell from "@/components/farm/FarmerShell";
import {
  Chip,
  EmptyState,
  ErrorNote,
  GhostButton,
  Input,
  LoadingRows,
  Modal,
  num,
  PageHeader,
  Panel,
  PrimaryButton,
  Select,
  shortDate,
  Stat,
  Textarea,
  Toast,
  useToast,
} from "@/components/farm/farmerUI";
import { useAuth } from "@/hooks/useAuth";
import { listFarms } from "@/lib/farms";
import type { Farm } from "@/lib/farms";
import {
  deleteSoilTest,
  farmerError,
  listSoilTests,
  saveSoilTest,
  uploadDocument,
} from "@/lib/farmer";
import type { SoilTest } from "@/lib/farmer";

/**
 * Soil Health — lab results per field.
 *
 * Values are shown as recorded and stay blank when the report did not include
 * them; the page never fills a missing NPK figure. Recommendations are built
 * from the measured numbers and always carry their source line, and the page
 * says plainly that a lab report (or the Soil Health Card scheme) is the
 * authority, not this screen.
 */

type Draft = {
  id?: string;
  farm_id: string;
  tested_on: string;
  lab_name: string;
  ph: string;
  ec: string;
  organic_carbon: string;
  nitrogen: string;
  phosphorus: string;
  potassium: string;
  soil_category: string;
  recommendation: string;
  report_url: string;
};

const emptyDraft = (farmId: string): Draft => ({
  farm_id: farmId,
  tested_on: new Date().toISOString().slice(0, 10),
  lab_name: "",
  ph: "",
  ec: "",
  organic_carbon: "",
  nitrogen: "",
  phosphorus: "",
  potassium: "",
  soil_category: "",
  recommendation: "",
  report_url: "",
});

/** Simple, published thresholds — used only to phrase a suggestion. */
function phReading(ph: number | null): { label: string; tone: "green" | "amber" | "red" | "slate" } {
  if (ph == null) return { label: "Not measured", tone: "slate" };
  if (ph < 5.5) return { label: "Strongly acidic", tone: "red" };
  if (ph < 6.0) return { label: "Acidic", tone: "amber" };
  if (ph <= 7.5) return { label: "Near neutral", tone: "green" };
  if (ph <= 8.5) return { label: "Alkaline", tone: "amber" };
  return { label: "Strongly alkaline", tone: "red" };
}

function buildRecommendation(test: SoilTest): string[] {
  const notes: string[] = [];
  if (test.ph != null) {
    if (test.ph < 6) {
      notes.push("Soil is acidic: apply agricultural lime before the next crop, based on the lab's dose.");
    } else if (test.ph > 8) {
      notes.push("Soil is alkaline: add organic matter and gypsum only as your lab advises.");
    } else {
      notes.push("pH is in the range most field crops tolerate.");
    }
  }
  if (test.organic_carbon != null && test.organic_carbon < 0.5) {
    notes.push("Organic carbon is low: add farmyard manure or a green manure crop each season.");
  }
  const npk = [test.nitrogen_kg_ha, test.phosphorus_kg_ha, test.potassium_kg_ha];
  if (npk.some((value) => value != null)) {
    notes.push("Split nitrogen doses by growth stage; confirm the exact kg/acre with your block officer.");
  }
  if (notes.length === 0) notes.push("Nothing measured yet — add the figures from your lab report.");
  return notes;
}

export default function SoilPage() {
  const { user } = useAuth();
  const { toast, showToast } = useToast();

  const [tests, setTests] = useState<SoilTest[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SoilTest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [testRows, farmRows] = await Promise.all([listSoilTests(), listFarms().catch(() => [])]);
      setTests(testRows);
      setFarms(farmRows);
    } catch (err) {
      setError(farmerError(err, "Could not load your soil tests."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const farmName = useMemo(() => new Map(farms.map((f) => [f.id, f.name])), [farms]);
  const latest = tests[0] ?? null;

  function openNew() {
    setFormError("");
    setDraft(emptyDraft(farms[0]?.id ?? ""));
  }

  function openEdit(test: SoilTest) {
    setFormError("");
    setDraft({
      id: test.id,
      farm_id: test.farm_id,
      tested_on: test.tested_on,
      lab_name: test.lab_name ?? "",
      ph: test.ph != null ? String(test.ph) : "",
      ec: test.ec_ds_m != null ? String(test.ec_ds_m) : "",
      organic_carbon: test.organic_carbon != null ? String(test.organic_carbon) : "",
      nitrogen: test.nitrogen_kg_ha != null ? String(test.nitrogen_kg_ha) : "",
      phosphorus: test.phosphorus_kg_ha != null ? String(test.phosphorus_kg_ha) : "",
      potassium: test.potassium_kg_ha != null ? String(test.potassium_kg_ha) : "",
      soil_category: test.soil_category ?? "",
      recommendation: test.recommendation ?? "",
      report_url: test.report_url ?? "",
    });
  }

  const numeric = (value: string) => (value.trim() === "" ? null : Number(value));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.farm_id) {
      setFormError("Choose which field this test belongs to. Add a farm first if you have not.");
      return;
    }
    const ph = numeric(draft.ph);
    if (ph != null && (Number.isNaN(ph) || ph < 0 || ph > 14)) {
      setFormError("pH must be between 0 and 14.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await saveSoilTest(
        {
          farm_id: draft.farm_id,
          tested_on: draft.tested_on,
          lab_name: draft.lab_name || null,
          ph,
          ec_ds_m: numeric(draft.ec),
          organic_carbon: numeric(draft.organic_carbon),
          nitrogen_kg_ha: numeric(draft.nitrogen),
          phosphorus_kg_ha: numeric(draft.phosphorus),
          potassium_kg_ha: numeric(draft.potassium),
          soil_category: draft.soil_category || null,
          recommendation: draft.recommendation || null,
          report_url: draft.report_url || null,
        },
        draft.id
      );
      setDraft(null);
      showToast(draft.id ? "Soil test updated" : "Soil test saved");
      await load();
    } catch (err) {
      setFormError(farmerError(err, "Could not save the soil test."));
    } finally {
      setSaving(false);
    }
  }

  async function uploadReport(file: File | null) {
    if (!file || !draft) return;
    setUploading(true);
    try {
      const doc = await uploadDocument(file, "soil_report", "Soil test report");
      setDraft({ ...draft, report_url: doc.file_path });
      showToast("Report uploaded");
    } catch (err) {
      setFormError(farmerError(err, "Could not upload the report."));
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteSoilTest(confirmDelete.id);
      setConfirmDelete(null);
      showToast("Soil test removed");
      await load();
    } catch (err) {
      setError(farmerError(err, "Could not remove the test."));
    } finally {
      setSaving(false);
    }
  }

  const readings = latest
    ? [
        { label: "pH", value: latest.ph != null ? num(latest.ph, 2) : "—" },
        { label: "Organic carbon (%)", value: latest.organic_carbon != null ? num(latest.organic_carbon, 2) : "—" },
        { label: "Nitrogen (kg/ha)", value: latest.nitrogen_kg_ha != null ? num(latest.nitrogen_kg_ha) : "—" },
        { label: "Phosphorus (kg/ha)", value: latest.phosphorus_kg_ha != null ? num(latest.phosphorus_kg_ha) : "—" },
        { label: "Potassium (kg/ha)", value: latest.potassium_kg_ha != null ? num(latest.potassium_kg_ha) : "—" },
        { label: "EC (dS/m)", value: latest.ec_ds_m != null ? num(latest.ec_ds_m, 2) : "—" },
      ]
    : [];

  return (
    <FarmerShell>
      <PageHeader
        icon={Layers}
        title="Soil Health"
        description="Soil test results for each field — pH, organic carbon and nutrients where the lab reported them — with plain-language next steps."
        actions={
          <PrimaryButton onClick={openNew} disabled={farms.length === 0}>
            <Plus className="h-4 w-4" /> Record soil test
          </PrimaryButton>
        }
      />

      {farms.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-amber-900">
            A soil test belongs to a field.{" "}
            <Link to="/my-farm" className="font-bold underline">
              Add a farm first
            </Link>{" "}
            so results can be filed against it.
          </p>
        </div>
      )}

      {error && <ErrorNote message={error} onRetry={() => void load()} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Soil tests" value={tests.length} icon={FlaskConical} hint="Records saved" />
        <Stat
          label="Latest pH"
          value={latest?.ph != null ? num(latest.ph, 2) : "—"}
          icon={Beaker}
          tone="teal"
          hint={latest ? phReading(latest.ph).label : "No test yet"}
        />
        <Stat
          label="Fields tested"
          value={new Set(tests.map((t) => t.farm_id)).size}
          icon={Layers}
          tone="blue"
          hint={`of ${farms.length} farms`}
        />
        <Stat
          label="Last tested"
          value={latest ? shortDate(latest.tested_on) : "—"}
          icon={FlaskConical}
          tone="slate"
          hint={latest?.lab_name ?? "Lab not named"}
        />
      </div>

      {loading ? (
        <Panel>
          <LoadingRows rows={4} />
        </Panel>
      ) : tests.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Layers}
            title="No soil tests recorded"
            body="Add the figures from your lab report (or Soil Health Card) and this page will show how each field is doing and what to add before the next crop."
            action={
              farms.length > 0 ? (
                <PrimaryButton onClick={openNew}>
                  <Plus className="h-4 w-4" /> Record soil test
                </PrimaryButton>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {latest && (
            <Panel
              className="xl:col-span-2"
              title={`Latest test — ${farmName.get(latest.farm_id) ?? "Farm"}`}
              description={`${shortDate(latest.tested_on)}${latest.lab_name ? ` · ${latest.lab_name}` : ""}`}
              icon={Beaker}
            >
              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
                {readings.map((reading) => (
                  <div key={reading.label} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">{reading.label}</p>
                    <p className="mt-0.5 text-lg font-extrabold text-forest">{reading.value}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 px-4 py-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Recommendations</p>
                  <Chip tone={phReading(latest.ph).tone}>{phReading(latest.ph).label}</Chip>
                  {latest.soil_category && <Chip tone="slate">{latest.soil_category}</Chip>}
                </div>
                <ul className="space-y-1.5">
                  {buildRecommendation(latest).map((note) => (
                    <li key={note} className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      {note}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[10px] leading-relaxed text-slate-500">
                  Source: {latest.source ?? "lab report"}
                  {latest.lab_name ? ` — ${latest.lab_name}` : ""}, tested {shortDate(latest.tested_on)}. Dose
                  amounts must come from the lab report or your block agriculture officer.
                </p>
                {latest.report_url && (
                  <Link
                    to="/account/documents"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> Report is saved in My Documents &amp; KYC
                  </Link>
                )}
              </div>
            </Panel>
          )}

          <Panel title="All soil tests" icon={FlaskConical}>
            <ul className="divide-y divide-slate-100">
              {tests.map((test) => (
                <li key={test.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-forest">
                      {farmName.get(test.farm_id) ?? "Farm"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {shortDate(test.tested_on)} · pH {test.ph != null ? num(test.ph, 2) : "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(test)}
                      className="rounded-md px-2 py-1 text-[11px] font-bold text-brand-700 hover:bg-brand-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(test)}
                      aria-label="Delete soil test"
                      className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-slate-400">
        A free Soil Health Card test is available at your block agriculture office. This page stores what your
        report says; it does not replace the report.
      </p>

      {draft && (
        <Modal
          title={draft.id ? "Edit soil test" : "Record a soil test"}
          description="Enter only what the lab report shows — leave a field blank if it was not tested."
          onClose={() => setDraft(null)}
          wide
          footer={
            <>
              <GhostButton onClick={() => setDraft(null)}>Cancel</GhostButton>
              <PrimaryButton type="submit" form="soil-form" disabled={saving}>
                {saving ? "Saving…" : "Save test"}
              </PrimaryButton>
            </>
          }
        >
          <form id="soil-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Field <span className="text-rose-500">*</span>
              </span>
              <Select value={draft.farm_id} onChange={(e) => setDraft({ ...draft, farm_id: e.target.value })} required>
                <option value="">Choose a farm</option>
                {farms.map((farm) => (
                  <option key={farm.id} value={farm.id}>
                    {farm.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Test date
              </span>
              <Input
                type="date"
                value={draft.tested_on}
                onChange={(e) => setDraft({ ...draft, tested_on: e.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Lab name
              </span>
              <Input
                value={draft.lab_name}
                onChange={(e) => setDraft({ ...draft, lab_name: e.target.value })}
                placeholder="e.g. Block soil testing lab"
              />
            </label>

            {[
              ["ph", "pH", "6.8"],
              ["ec", "EC (dS/m)", "0.35"],
              ["organic_carbon", "Organic carbon (%)", "0.62"],
              ["nitrogen", "Nitrogen (kg/ha)", "280"],
              ["phosphorus", "Phosphorus (kg/ha)", "24"],
              ["potassium", "Potassium (kg/ha)", "180"],
            ].map(([key, labelText, placeholder]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {labelText}
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={draft[key as keyof Draft] as string}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  placeholder={placeholder}
                />
              </label>
            ))}

            <label className="block sm:col-span-3">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Soil category (optional)
              </span>
              <Input
                value={draft.soil_category}
                onChange={(e) => setDraft({ ...draft, soil_category: e.target.value })}
                placeholder="e.g. Alluvial, low organic matter"
              />
            </label>

            <label className="block sm:col-span-3">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Lab recommendation (optional)
              </span>
              <Textarea
                rows={2}
                value={draft.recommendation}
                onChange={(e) => setDraft({ ...draft, recommendation: e.target.value })}
                placeholder="Copy the recommendation line from the report"
              />
            </label>

            <div className="sm:col-span-3">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Upload the report
              </span>
              <label className="creator-btn-ghost h-9 cursor-pointer px-3 text-xs">
                <FileUp className="h-3.5 w-3.5" />
                {uploading ? "Uploading…" : draft.report_url ? "Replace report" : "Choose file"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => void uploadReport(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="mt-1 text-[10px] text-slate-400">
                JPG, PNG or PDF up to 10 MB. Stored privately in your account.
              </p>
            </div>

            {formError && (
              <p role="alert" className="sm:col-span-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </p>
            )}
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete this soil test?"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <GhostButton onClick={() => setConfirmDelete(null)}>Keep it</GhostButton>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={saving}
                className="h-9 rounded-lg bg-rose-600 px-3.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                Delete
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            The test from {shortDate(confirmDelete.tested_on)} will be removed from your records.
          </p>
        </Modal>
      )}

      <Toast message={toast} />
    </FarmerShell>
  );
}

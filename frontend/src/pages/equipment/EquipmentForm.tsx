import { useMemo, useState } from "react";
import { ArrowLeft, Camera, IndianRupee, Save, Trash2, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import EquipmentLayout, { EQUIPMENT_ROUTES } from "@/components/equipment/EquipmentLayout";
import {
  EquipmentStatusPill,
  SectionHeading,
} from "@/components/equipment/ui";
import {
  ErrorNotice,
  Field,
  Loading,
  Modal,
  Panel,
  inputClass,
} from "@/components/retailer/ui";
import { useWorkerData } from "@/hooks/useWorkerData";
import {
  EQUIPMENT_GROUPS,
  FUEL_TYPES,
  RATE_UNITS,
  RATE_UNIT_LABEL,
  createEquipment,
  createBlock,
  deleteBlock,
  describeEquipmentError,
  formatDate,
  formatINR,
  getEquipment,
  getPricing,
  listBlocks,
  quoteCost,
  savePricing,
  uploadPrivateFile,
  updateEquipment,
} from "@/lib/equipment";
import type { Equipment, EquipmentBlock, EquipmentPricing, RateUnit } from "@/lib/equipment";
import type { EquipmentInput } from "@/lib/equipment";

/**
 * Add or edit one machine, plus its price sheet.
 *
 * The header price (`rate_inr`/`rate_unit`) is kept in step with the price sheet
 * because `features.sql` and the farmer-facing rental screen read the header
 * columns. The sheet carries the full model: minimums, operator/fuel/transport
 * rates and the advance.
 */
export default function EquipmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const D = describeEquipmentError;
  const isNew = !id || id === "new";

  const existing = useWorkerData<Equipment | null>(
    () => (isNew ? Promise.resolve(null) : getEquipment(id!)),
    [id],
    D
  );
  const pricing = useWorkerData<EquipmentPricing | null>(
    () => (isNew ? Promise.resolve(null) : getPricing(id!)),
    [id],
    D
  );
  const blocks = useWorkerData<EquipmentBlock[]>(
    () => (isNew ? Promise.resolve([]) : listBlocks(id!)),
    [id],
    D
  );

  if (!isNew && existing.state === "loading") {
    return (
      <EquipmentLayout title="Equipment">
        <Loading label="Loading machine…" />
      </EquipmentLayout>
    );
  }

  return (
    <EquipmentLayout
      title={isNew ? "Add equipment" : (existing.data?.title ?? "Equipment")}
      subtitle={isNew ? "Register a machine for rental" : "Details, pricing and availability"}
      action={
        <button
          type="button"
          onClick={() => navigate(EQUIPMENT_ROUTES.equipment)}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All equipment
        </button>
      }
    >
      {(existing.state === "error" || pricing.state === "error") && (
        <ErrorNotice
          message={(existing.state === "error" ? existing.error : pricing.error) ?? ""}
          onRetry={existing.reload}
        />
      )}

      <FormBody
        key={isNew ? "new" : existing.data?.id ?? id}
        isNew={isNew}
        equipment={existing.data ?? null}
        pricing={pricing.data ?? null}
        blocks={blocks.data ?? []}
        onSaved={(saved) => navigate(`${EQUIPMENT_ROUTES.equipment}/${saved.id}`)}
        onBlocksReload={blocks.reload}
      />
    </EquipmentLayout>
  );
}

function FormBody({
  isNew,
  equipment,
  pricing,
  blocks,
  onSaved,
  onBlocksReload,
}: {
  isNew: boolean;
  equipment: Equipment | null;
  pricing: EquipmentPricing | null;
  blocks: EquipmentBlock[];
  onSaved: (saved: Equipment) => void;
  onBlocksReload: () => void;
}) {
  const D = describeEquipmentError;

  const [title, setTitle] = useState(equipment?.title ?? "");
  const [category, setCategory] = useState(equipment?.category ?? EQUIPMENT_GROUPS[0].items[0]);
  const [brand, setBrand] = useState(equipment?.brand ?? "");
  const [model, setModel] = useState(equipment?.model ?? "");
  const [year, setYear] = useState(equipment?.manufacture_year != null ? String(equipment.manufacture_year) : "");
  const [registration, setRegistration] = useState(equipment?.registration_no ?? "");
  const [specifications, setSpecifications] = useState(equipment?.specifications ?? "");
  const [capacityText, setCapacityText] = useState(equipment?.capacity_text ?? "");
  const [hourlyAcres, setHourlyAcres] = useState(
    equipment?.hourly_capacity_acres != null ? String(equipment.hourly_capacity_acres) : ""
  );
  const [hp, setHp] = useState(equipment?.hp != null ? String(equipment.hp) : "");
  const [locationText, setLocationText] = useState(equipment?.location_text ?? "");
  const [village, setVillage] = useState(equipment?.village ?? "");
  const [district, setDistrict] = useState(equipment?.district ?? "");
  const [stateName, setStateName] = useState(equipment?.state ?? "");
  const [serviceDistricts, setServiceDistricts] = useState((equipment?.service_districts ?? []).join(", "));
  const [radius, setRadius] = useState(equipment?.service_radius_km != null ? String(equipment.service_radius_km) : "");
  const [offersDelivery, setOffersDelivery] = useState(equipment?.offers_delivery ?? false);
  const [condition, setCondition] = useState(String(equipment?.condition_score ?? 8));
  const [fuelType, setFuelType] = useState(equipment?.fuel_type ?? "");
  const [fuelIncluded, setFuelIncluded] = useState(equipment?.fuel_included ?? false);
  const [operatorAvailable, setOperatorAvailable] = useState(equipment?.operator_available ?? false);
  const [operatorIncluded, setOperatorIncluded] = useState(equipment?.operator_included ?? false);
  const [description, setDescription] = useState(equipment?.description ?? "");
  const [isListed, setIsListed] = useState(equipment?.is_listed ?? true);
  const [images, setImages] = useState<string[]>(equipment?.images ?? []);
  const [uploading, setUploading] = useState(false);

  /* Price sheet */
  const [rateUnit, setRateUnit] = useState<RateUnit>(pricing?.rate_unit ?? equipment?.rate_unit ?? "day");
  const [baseRate, setBaseRate] = useState(
    pricing ? String(pricing.base_rate_inr) : equipment ? String(equipment.rate_inr) : ""
  );
  const [minHours, setMinHours] = useState(pricing?.minimum_hours != null ? String(pricing.minimum_hours) : "");
  const [minDays, setMinDays] = useState(pricing?.minimum_days != null ? String(pricing.minimum_days) : "1");
  const [maxDays, setMaxDays] = useState(pricing?.maximum_days != null ? String(pricing.maximum_days) : "");
  const [operatorRate, setOperatorRate] = useState(
    pricing ? String(pricing.operator_rate_inr) : "0"
  );
  const [fuelRate, setFuelRate] = useState(pricing ? String(pricing.fuel_rate_inr) : "0");
  const [transportRate, setTransportRate] = useState(pricing ? String(pricing.transport_rate_inr) : "0");
  const [otherLabel, setOtherLabel] = useState(pricing?.other_service_label ?? "");
  const [otherRate, setOtherRate] = useState(pricing ? String(pricing.other_service_rate_inr) : "0");
  const [advancePct, setAdvancePct] = useState(pricing ? String(pricing.advance_percent) : "0");
  const [cancellation, setCancellation] = useState(pricing?.cancellation_policy ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [blockOpen, setBlockOpen] = useState(false);

  /** Live preview of what a renter would be shown. */
  const preview = useMemo(() => {
    const base = Number(baseRate);
    if (!Number.isFinite(base) || base <= 0) return null;
    return quoteCost({
      pricing: {
        rate_unit: rateUnit,
        base_rate_inr: base,
        minimum_days: minDays ? Number(minDays) : 1,
        minimum_hours: minHours ? Number(minHours) : null,
        operator_rate_inr: Number(operatorRate) || 0,
        fuel_rate_inr: Number(fuelRate) || 0,
        transport_rate_inr: Number(transportRate) || 0,
        other_service_rate_inr: Number(otherRate) || 0,
        other_service_label: otherLabel || null,
        advance_percent: Number(advancePct) || 0,
      },
      days: 1,
      withOperator: operatorAvailable,
      withFuel: fuelIncluded,
      withTransport: offersDelivery,
    });
  }, [baseRate, rateUnit, minDays, minHours, operatorRate, fuelRate, transportRate, otherRate, otherLabel, advancePct, operatorAvailable, fuelIncluded, offersDelivery]);

  async function handleUploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const paths: string[] = [];
      for (const file of Array.from(files).slice(0, 6)) {
        paths.push(await uploadPrivateFile(file, "equipment"));
      }
      setImages((prev) => [...prev, ...paths].slice(0, 8));
    } catch (err) {
      setError(D(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (title.trim().length < 2) {
      setError("Give the machine a name, e.g. Mahindra 575 DI.");
      return;
    }
    const base = Number(baseRate);
    if (!Number.isFinite(base) || base <= 0) {
      setError("Enter the rental rate — a renter needs to see a price.");
      return;
    }

    const payload: EquipmentInput = {
      title: title.trim(),
      category,
      brand: brand.trim() || null,
      model: model.trim() || null,
      manufacture_year: year.trim() ? Number(year) : null,
      registration_no: registration.trim() || null,
      specifications: specifications.trim() || null,
      capacity_text: capacityText.trim() || null,
      hourly_capacity_acres: hourlyAcres.trim() ? Number(hourlyAcres) : null,
      hp: hp.trim() ? Number(hp) : null,
      images,
      location_text: locationText.trim() || null,
      village: village.trim() || null,
      district: district.trim() || null,
      state: stateName.trim() || null,
      service_districts: serviceDistricts
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
      service_radius_km: radius.trim() ? Number(radius) : null,
      offers_delivery: offersDelivery,
      condition_score: Math.min(Math.max(Number(condition) || 5, 0), 10),
      fuel_type: fuelType || null,
      fuel_included: fuelIncluded,
      operator_available: operatorAvailable,
      operator_included: operatorIncluded,
      description: description.trim() || null,
      is_listed: isListed,
      rate_inr: base,
      rate_unit: rateUnit,
    };

    setBusy(true);
    setError("");
    try {
      const row = isNew
        ? await createEquipment(payload)
        : await updateEquipment(equipment!.id, payload);

      await savePricing(row.id, {
        rate_unit: rateUnit,
        base_rate_inr: base,
        minimum_hours: minHours.trim() ? Number(minHours) : null,
        minimum_days: minDays.trim() ? Number(minDays) : null,
        maximum_days: maxDays.trim() ? Number(maxDays) : null,
        operator_rate_inr: Number(operatorRate) || 0,
        fuel_rate_inr: Number(fuelRate) || 0,
        transport_rate_inr: Number(transportRate) || 0,
        other_service_label: otherLabel.trim() || null,
        other_service_rate_inr: Number(otherRate) || 0,
        advance_percent: Math.min(Math.max(Number(advancePct) || 0, 0), 100),
        cancellation_policy: cancellation.trim() || null,
      });

      setSaved(true);
      onSaved(row);
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <ErrorNotice message={error} />}
      {saved && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11.5px] font-semibold text-emerald-800">
          Saved. The machine and its price sheet are up to date.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Machine details" description="What the renter sees first">
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Equipment name" required>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={120} />
              </Field>
              <Field label="Category" required>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                  {EQUIPMENT_GROUPS.map((group) => (
                    <optgroup key={group.key} label={group.label}>
                      {group.items.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Brand">
                <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Model">
                <input value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Manufacturing year">
                <input value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} inputMode="numeric" />
              </Field>
              <Field label="Registration number" hint="Leave blank for implements that are not registered.">
                <input value={registration} onChange={(e) => setRegistration(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Machine specifications">
                <input
                  value={specifications}
                  onChange={(e) => setSpecifications(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 4-cylinder, 50 HP, 8 forward gears"
                />
              </Field>
              <Field label="Capacity / size">
                <input
                  value={capacityText}
                  onChange={(e) => setCapacityText(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 3 t trolley, 20 L tank"
                />
              </Field>
              <Field label="Hourly capacity (acres/hour)" hint="Optional — helps a renter judge the job.">
                <input value={hourlyAcres} onChange={(e) => setHourlyAcres(e.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
              <Field label="Engine power (HP)">
                <input value={hp} onChange={(e) => setHp(e.target.value)} className={inputClass} inputMode="numeric" />
              </Field>
              <Field label="Fuel type">
                <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className={inputClass}>
                  <option value="">Not specified</option>
                  {FUEL_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Current condition" hint="0 = unusable, 10 = like new.">
                <input value={condition} onChange={(e) => setCondition(e.target.value)} className={inputClass} inputMode="numeric" />
              </Field>
            </div>

            <div className="border-t border-slate-100 p-4 sm:p-5">
              <Field label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={1500}
                  className={`${inputClass} resize-none`}
                  placeholder="What the machine is good for, attachments included, anything a renter should know."
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Photographs" description="Private storage — renters see them through the app">
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Camera className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Add photo"}
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => void handleUploadPhotos(e.target.files)}
                  />
                </label>
                <span className="text-[10.5px] text-slate-500">{images.length} of 8</span>
              </div>
              {images.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {images.map((path, i) => (
                    <li
                      key={`${path}-${i}`}
                      className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10.5px] text-slate-600"
                    >
                      <span className="truncate">{path.split("/").pop()}</span>
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove photo"
                        className="ml-auto shrink-0 text-rose-600 hover:text-rose-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel title="Pricing" description="Everything the renter is charged, itemised">
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Pricing model" required>
                <select value={rateUnit} onChange={(e) => setRateUnit(e.target.value as RateUnit)} className={inputClass}>
                  {RATE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {RATE_UNIT_LABEL[u]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Base rate (₹)" required>
                <input value={baseRate} onChange={(e) => setBaseRate(e.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
              <Field label="Minimum hours">
                <input value={minHours} onChange={(e) => setMinHours(e.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
              <Field label="Minimum days">
                <input value={minDays} onChange={(e) => setMinDays(e.target.value)} className={inputClass} inputMode="numeric" />
              </Field>
              <Field label="Maximum days">
                <input value={maxDays} onChange={(e) => setMaxDays(e.target.value)} className={inputClass} inputMode="numeric" />
              </Field>
              <Field label="Advance required (%)">
                <input value={advancePct} onChange={(e) => setAdvancePct(e.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
              <Field label="Operator charge (₹/day)">
                <input value={operatorRate} onChange={(e) => setOperatorRate(e.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
              <Field label="Fuel charge (₹/day)" hint="Only charged when fuel is not included.">
                <input value={fuelRate} onChange={(e) => setFuelRate(e.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
              <Field label="Transportation charge (₹)">
                <input value={transportRate} onChange={(e) => setTransportRate(e.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
              <Field label="Other service name">
                <input value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} className={inputClass} placeholder="e.g. attachment change" />
              </Field>
              <Field label="Other service charge (₹)">
                <input value={otherRate} onChange={(e) => setOtherRate(e.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
            </div>
            <div className="border-t border-slate-100 p-4 sm:p-5">
              <Field label="Cancellation policy">
                <textarea
                  value={cancellation}
                  onChange={(e) => setCancellation(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  className={`${inputClass} resize-none`}
                  placeholder="e.g. Free cancellation 48 hours before the start date."
                />
              </Field>
            </div>

            {preview && (
              <div className="border-t border-slate-100 bg-slate-50 p-4 sm:p-5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  What a renter sees for a 1-day job
                </p>
                <dl className="mt-1.5 space-y-1 text-[11.5px]">
                  <Row label={`Rental (${preview.days} day)`} value={formatINR(preview.rental)} />
                  {preview.operator > 0 && <Row label="Operator" value={formatINR(preview.operator)} />}
                  {preview.fuel > 0 && <Row label="Fuel" value={formatINR(preview.fuel)} />}
                  {preview.transport > 0 && <Row label="Transportation" value={formatINR(preview.transport)} />}
                  {preview.other > 0 && <Row label={preview.otherLabel ?? "Other service"} value={formatINR(preview.other)} />}
                  <div className="flex items-center justify-between border-t border-slate-200 pt-1 text-[12.5px] font-bold text-forest">
                    <span>Total</span>
                    <span>{formatINR(preview.total)}</span>
                  </div>
                  {preview.advance > 0 && (
                    <p className="text-[10.5px] text-slate-500">Advance: {formatINR(preview.advance)}</p>
                  )}
                </dl>
              </div>
            )}
          </Panel>

          <Panel title="Inclusions" description="Be explicit — this avoids arguments later">
            <div className="space-y-1.5 p-4 sm:p-5">
              <Check label="Operator available for this machine" checked={operatorAvailable} onChange={setOperatorAvailable} />
              <Check label="Operator charge is included in the base price" checked={operatorIncluded} onChange={setOperatorIncluded} />
              <Check label="Fuel is included in the price" checked={fuelIncluded} onChange={setFuelIncluded} />
              <Check label="Transport to the farm is offered" checked={offersDelivery} onChange={setOffersDelivery} />
              <Check label="List this machine for renters" checked={isListed} onChange={setIsListed} />
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Location & service area" description="Where the machine works">
            <div className="space-y-3 p-4">
              <Field label="Location (text)">
                <input value={locationText} onChange={(e) => setLocationText(e.target.value)} className={inputClass} placeholder="e.g. Near block office, Kalyani" />
              </Field>
              <Field label="Village / local area">
                <input value={village} onChange={(e) => setVillage(e.target.value)} className={inputClass} />
              </Field>
              <Field label="District">
                <input value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass} />
              </Field>
              <Field label="State">
                <input value={stateName} onChange={(e) => setStateName(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Service districts" hint="Comma separated. Renters filter on these.">
                <input value={serviceDistricts} onChange={(e) => setServiceDistricts(e.target.value)} className={inputClass} placeholder="Nadia, Hooghly" />
              </Field>
              <Field label="Service radius (km)">
                <input value={radius} onChange={(e) => setRadius(e.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
            </div>
          </Panel>

          {!isNew && equipment && (
            <Panel
              title="Blocked periods"
              description="Maintenance and unavailability"
              action={
                <button
                  type="button"
                  onClick={() => setBlockOpen(true)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Block dates
                </button>
              }
            >
              {blocks.length === 0 ? (
                <p className="px-4 py-3 text-[11px] text-slate-500">
                  No blocked periods. Bookings and maintenance both block dates automatically.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {blocks.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold capitalize text-forest">{b.kind}</p>
                        <p className="text-[10px] text-slate-500">
                          {formatDate(b.starts_on)} → {formatDate(b.ends_on)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteBlock(b.id);
                          onBlocksReload();
                        }}
                        aria-label="Remove block"
                        className="shrink-0 text-rose-600 hover:text-rose-800"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {!isNew && equipment && (
            <Panel title="Status">
              <div className="p-4">
                <EquipmentStatusPill status={equipment.status} />
                <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
                  Status is driven by bookings and maintenance. Change it on the My Equipment screen.
                </p>
              </div>
            </Panel>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" /> {busy ? "Saving…" : isNew ? "Create machine" : "Save changes"}
          </button>

          <Panel title="Price check" description="What matters to a renter">
            <div className="space-y-2 p-4 text-[11px] leading-relaxed text-slate-600">
              <p className="flex items-center gap-1.5">
                <IndianRupee className="h-3 w-3 shrink-0 text-slate-400" />
                {preview ? `${formatINR(preview.total)} for a one-day job` : "Enter a base rate to preview"}
              </p>
              <p>
                The breakdown above is exactly what the renter sees before confirming. Nothing extra can be
                added afterwards.
              </p>
            </div>
          </Panel>
        </aside>
      </div>

      {!isNew && equipment && blockOpen && (
        <BlockModal
          equipmentId={equipment.id}
          onClose={() => setBlockOpen(false)}
          onSaved={() => {
            setBlockOpen(false);
            onBlocksReload();
          }}
        />
      )}

      {!isNew && (
        <section>
          <SectionHeading title="Tips for a machine that books well" />
          <Panel title="Details that reduce cancellations">
            <ul className="space-y-1.5 p-4 text-[11px] leading-relaxed text-slate-600 sm:p-5">
              <li>• Say plainly whether operator and fuel are included — most disputes start here.</li>
              <li>• Keep the service date current; a stale date is the commonest reason a machine sits idle.</li>
              <li>• A clear photo of the machine and its attachments gets far more requests.</li>
              <li>• Set the service radius honestly; a renter will not re-book if delivery is impossible.</li>
            </ul>
          </Panel>
        </section>
      )}
    </>
  );
}

function BlockModal({
  equipmentId,
  onClose,
  onSaved,
}: {
  equipmentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const D = describeEquipmentError;
  const [kind, setKind] = useState<EquipmentBlock["kind"]>("maintenance");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!startsOn || !endsOn) {
      setError("Choose both the start and end date.");
      return;
    }
    if (endsOn < startsOn) {
      setError("The end date cannot be before the start date.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createBlock({
        equipment_id: equipmentId,
        kind,
        starts_on: startsOn,
        ends_on: endsOn,
        reason: reason.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(D(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Block these dates" subtitle="The machine will not be bookable">
      <div className="space-y-3">
        <Field label="Reason" required>
          <select value={kind} onChange={(e) => setKind(e.target.value as EquipmentBlock["kind"])} className={inputClass}>
            <option value="maintenance">Maintenance / repair</option>
            <option value="unavailable">Temporarily unavailable</option>
            <option value="weather">Weather</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" required>
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={inputClass} />
          </Field>
          <Field label="To" required>
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Note" hint="Shown to you and anyone managing the fleet.">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={200}
            className={`${inputClass} resize-none`}
          />
        </Field>
        <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-amber-900">
          If a booking already falls inside these dates the database will refuse the block — cancel or
          move that booking first.
        </p>
        {error && <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
          >
            {busy ? "Blocking…" : "Block dates"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-700"
      />
      <span className="text-[11.5px] text-slate-700">{label}</span>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-forest">{value}</span>
    </div>
  );
}

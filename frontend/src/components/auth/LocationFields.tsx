import { useMemo } from "react";
import { MapPin } from "lucide-react";
import { blocksOf, districtsOf, hasBlockList, STATE_NAMES } from "@/lib/locations";
import { useLang } from "@/i18n/LanguageContext";

export type LocationValue = {
  state: string;
  district: string;
  village: string;
};

export const EMPTY_LOCATION: LocationValue = { state: "", district: "", village: "" };

const labelClass = "mb-1.5 block text-sm font-semibold text-forest";

function fieldClass(error?: string) {
  return `h-11 w-full rounded-lg border bg-white px-3.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${error
      ? "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-100"
      : "border-slate-300 hover:border-slate-400 focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
    }`;
}

type Props = {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  errors?: Partial<Record<keyof LocationValue, string>>;
  /** Show the state select (off when a flow is state-agnostic). */
  showState?: boolean;
  /** Label for the third level. Defaults to the translated "Village / Block". */
  villageLabel?: string;
  required?: { state?: boolean; district?: boolean; village?: boolean };
};

/**
 * Cascading State → District → Village/Block picker.
 *
 * Choosing a state resets the district, and a district resets the village, so the
 * three answers can never drift out of sync. When a curated block list exists
 * (all of West Bengal) the last field is a searchable `<select>`; otherwise it
 * stays a free-text input so other states are not blocked.
 */
export default function LocationFields({
  value,
  onChange,
  errors = {},
  showState = true,
  villageLabel,
  required = { state: true, district: true, village: true },
}: Props) {
  const { t } = useLang();
  const villageLabelText = villageLabel ?? t("loc.village");
  const districts = useMemo(() => districtsOf(value.state), [value.state]);
  const blocks = useMemo(() => blocksOf(value.state, value.district), [value.state, value.district]);

  const districtDisabled = showState && !value.state;
  const villageDisabled = !value.district || (showState && !value.state);

  function pickState(state: string) {
    onChange({ state, district: state === value.state ? value.district : "", village: "" });
  }

  function pickDistrict(district: string) {
    onChange({ ...value, district, village: district === value.district ? value.village : "" });
  }

  function pickVillage(village: string) {
    onChange({ ...value, village });
  }

  const requiredMark = (flag?: boolean) =>
    flag ? null : <span className="ml-1 font-normal text-slate-400">{t("loc.optional")}</span>;

  return (
    <div className="space-y-4">
      {showState && (
        <div>
          <label htmlFor="loc-state" className={labelClass}>
            {t("loc.state")}
            {requiredMark(required.state)}
          </label>
          <select
            id="loc-state"
            name="state"
            autoComplete="address-level1"
            value={value.state}
            onChange={(e) => pickState(e.target.value)}
            aria-invalid={!!errors.state}
            className={fieldClass(errors.state)}
          >
            <option value="">{t("loc.selectState")}</option>
            <optgroup label={t("loc.groupLaunch")}>
              {STATE_NAMES.launch.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("loc.groupAll")}>
              {STATE_NAMES.states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("loc.groupUT")}>
              {STATE_NAMES.unionTerritories.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </optgroup>
          </select>
          {errors.state ? (
            <p className="mt-1.5 text-xs font-medium text-red-600">{errors.state}</p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">
              {t("loc.stateHint")}
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="loc-district" className={labelClass}>
          {t("loc.district")}
          {requiredMark(required.district)}
        </label>
        <select
          id="loc-district"
          name="district"
          autoComplete="address-level2"
          value={value.district}
          onChange={(e) => pickDistrict(e.target.value)}
          disabled={districtDisabled}
          aria-invalid={!!errors.district}
          className={fieldClass(errors.district)}
        >
          <option value="">
            {districtDisabled ? t("loc.selectStateFirst") : t("loc.selectDistrict")}
          </option>
          {districts.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </select>
        {errors.district && (
          <p className="mt-1.5 text-xs font-medium text-red-600">{errors.district}</p>
        )}
      </div>

      <div>
        <label htmlFor="loc-village" className={labelClass}>
          {villageLabelText}
          {requiredMark(required.village)}
        </label>

        {hasBlockList(value.state, value.district) ? (
          <select
            id="loc-village"
            name="village"
            value={value.village}
            onChange={(e) => pickVillage(e.target.value)}
            disabled={villageDisabled}
            aria-invalid={!!errors.village}
            className={fieldClass(errors.village)}
          >
            <option value="">
              {villageDisabled ? t("loc.selectDistrictFirst") : t("loc.selectVillage")}
            </option>
            {(blocks ?? []).map((block) => (
              <option key={block} value={block}>
                {block}
              </option>
            ))}
          </select>
        ) : (
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              id="loc-village"
              name="village"
              type="text"
              list="loc-village-suggestions"
              value={value.village}
              onChange={(e) => pickVillage(e.target.value)}
              disabled={villageDisabled}
              placeholder={
                villageDisabled ? t("loc.selectDistrictFirst") : t("loc.villagePlaceholder")
              }
              aria-invalid={!!errors.village}
              className={`${fieldClass(errors.village)} pl-10`}
            />
            {!villageDisabled && (blocks ?? []).length > 0 && (
              <datalist id="loc-village-suggestions">
                {(blocks ?? []).map((block) => (
                  <option key={block} value={block} />
                ))}
              </datalist>
            )}
          </div>
        )}

        {errors.village ? (
          <p className="mt-1.5 text-xs font-medium text-red-600">{errors.village}</p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-500">
            {t("loc.villageHint")}
          </p>
        )}
      </div>
    </div>
  );
}

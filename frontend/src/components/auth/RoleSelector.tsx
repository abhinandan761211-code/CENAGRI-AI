import { Check } from "lucide-react";
import { USER_ROLES } from "@/types";
import type { UserRole } from "@/types";

type Props = {
  value: UserRole | "";
  onChange: (role: UserRole) => void;
  error?: string;
};

/** The "I am a…" pill group — shared by signup and the post-OAuth role step. */
export default function RoleSelector({ value, onChange, error }: Props) {
  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-semibold text-forest">I am a…</legend>
      <div className="flex flex-wrap gap-2">
        {USER_ROLES.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              aria-pressed={active}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
                active
                  ? "border-brand-700 bg-brand-700 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-600 hover:border-brand-400 hover:text-brand-800"
              }`}
            >
              {active && <Check className="mr-1 inline h-3.5 w-3.5" />}
              {option}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </fieldset>
  );
}

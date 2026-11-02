import { forwardRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLang } from "@/i18n/LanguageContext";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: LucideIcon;
  hint?: string;
  error?: string;
};

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, icon: Icon, hint, error, type = "text", className = "", id, ...props },
  ref
) {
  const [show, setShow] = useState(false);
  const { t } = useLang();
  const isPassword = type === "password";
  const inputId = id ?? props.name;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-forest">
        {label}
      </label>

      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
        )}

        <input
          ref={ref}
          id={inputId}
          type={isPassword && show ? "text" : type}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`h-11 w-full rounded-lg border bg-white text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-4 ${Icon ? "pl-10" : "pl-3.5"
            } ${isPassword ? "pr-10" : "pr-3.5"} ${error
              ? "border-red-300 focus:border-red-500 focus:ring-red-100"
              : "border-slate-300 hover:border-slate-400 focus:border-brand-600 focus:ring-brand-100"
            }`}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? t("field.hidePassword") : t("field.showPassword")}
            className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export default TextField;

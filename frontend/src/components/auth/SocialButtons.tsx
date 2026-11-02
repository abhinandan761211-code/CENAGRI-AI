import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router-dom";
import { useLang } from "@/i18n/LanguageContext";

function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

type Props = {
  action: "Sign in" | "Sign up";
  onError?: (message: string) => void;
};

export default function SocialButtons({ action, onError }: Props) {
  const { signInWithGoogle, configured } = useAuth();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const next = params.get("redirect") || params.get("next") || "/dashboard";

  const label = action === "Sign in" ? t("social.signIn") : t("social.signUp");

  async function handleGoogle() {
    if (!configured) {
      onError?.(t("social.unconfigured"));
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle(next);
      // Browser is redirected to Google — keep the spinner until it navigates.
    } catch (err) {
      setBusy(false);
      onError?.(err instanceof Error ? err.message : t("social.failed"));
    }
  }

  return (
    <button
      type="button"
      onClick={handleGoogle}
      disabled={busy}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <GoogleIcon />}
      {label}
    </button>
  );
}

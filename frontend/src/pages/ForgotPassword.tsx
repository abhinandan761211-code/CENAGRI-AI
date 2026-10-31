import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import TextField from "@/components/auth/TextField";
import { useAuth } from "@/hooks/useAuth";

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    setError("");

    if (!email) return setEmailError("Enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setEmailError("That doesn't look like a valid email.");
    setEmailError("");

    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[26px] font-extrabold tracking-tight text-forest sm:text-3xl">
        Reset your password
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Enter the email you signed up with and we&apos;ll send you a secure reset link.
      </p>

      {sent ? (
        <div
          role="status"
          className="mt-7 flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>If that email has an account, a reset link is on its way. Check spam too.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
          <TextField
            label="Email address"
            name="email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="name@farm.com"
            error={emailError}
          />

          <button
            type="submit"
            disabled={loading}
            className="btn-primary h-11 w-full text-[15px] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending link…
              </>
            ) : (
              "Send reset link"
            )}
          </button>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </form>
      )}

      <Link
        to="/login"
        className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </Link>
    </AuthLayout>
  );
}

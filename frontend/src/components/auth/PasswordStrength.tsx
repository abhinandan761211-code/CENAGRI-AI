const LEVELS = [
  { label: "Too weak", bar: "bg-red-400", text: "text-red-600" },
  { label: "Weak", bar: "bg-orange-400", text: "text-orange-600" },
  { label: "Fair", bar: "bg-amber-400", text: "text-amber-600" },
  { label: "Strong", bar: "bg-brand-500", text: "text-brand-700" },
] as const;

export function scorePassword(pw: string): number {
  if (!pw) return -1;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

export default function PasswordStrength({ value }: { value: string }) {
  const score = scorePassword(value);
  if (score < 0) return null;

  const level = LEVELS[Math.max(score - 1, 0)];

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= score ? level.bar : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className={`mt-1.5 text-xs font-medium ${level.text}`}>
        Password strength: {level.label}
        {score < 3 && (
          <span className="font-normal text-slate-500">
            {" "}
            — use 8+ characters with a mix of letters, numbers &amp; symbols.
          </span>
        )}
      </p>
    </div>
  );
}

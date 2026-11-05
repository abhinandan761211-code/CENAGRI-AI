import { Link } from "react-router-dom";

type LogoProps = {
  className?: string;
  variant?: "dark" | "light";
  /** Show only the mark — used when the sidebar is collapsed to an icon rail. */
  compact?: boolean;
};

/**
 * The Kalika mark — a bud on a stem inside a rounded tile.
 *
 * Green enough to read as agriculture, soft enough to sit beside the spark in
 * the wordmark. Every gradient id is prefixed `kalika-` so two marks on one
 * page (header + footer) cannot collide, and the petals are shapes, not text,
 * so the mark holds up at favicon size.
 */
export function KalikaMark({ size = 36, tone = "green" }: { size?: number; tone?: "green" | "mono" }) {
  const mono = tone === "mono";
  const tile = mono ? "#ffffff" : undefined;
  const bud = mono ? "#1d4b3a" : "#d9f99d";
  const budBack = mono ? "#1d4b3a" : "#ffffff";
  const stem = mono ? "#1d4b3a" : "#ffffff";

  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="kalika-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2b6350" />
          <stop offset="100%" stopColor="#12352a" />
        </linearGradient>
        <linearGradient id="kalika-glint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="11" fill={tile ?? "url(#kalika-tile)"} />
      {!mono && <rect width="36" height="36" rx="11" fill="url(#kalika-glint)" />}
      <path d="M18 29.5V17" stroke={stem} strokeWidth="1.7" strokeLinecap="round" opacity="0.95" />
      <path d="M18 17.5c0-5 2.6-8.5 7.5-9.5 .4 5.6-2.4 9.3-7.5 9.5Z" fill={budBack} fillOpacity="0.45" />
      <path d="M18 18.5c0-5.4-2.8-8.8-7.6-10 0 6 2.6 9.9 7.6 10Z" fill={bud} />
      <circle cx="18" cy="10.6" r="1.5" fill={budBack} fillOpacity="0.9" />
    </svg>
  );
}

export default function Logo({ className = "", variant = "dark", compact = false }: LogoProps) {
  const text = variant === "light" ? "text-white" : "text-forest";

  return (
    <Link to="/" className={`group inline-flex items-center gap-2 ${className}`} aria-label="Kalika home">
      <span className="transition-transform duration-300 ease-out group-hover:-rotate-6">
        <KalikaMark size={36} tone={variant === "light" ? "mono" : "green"} />
      </span>
      {!compact && (
        <span className={`font-display text-lg font-extrabold tracking-tight ${text}`}>
          Kalika
        </span>
      )}
    </Link>
  );
}

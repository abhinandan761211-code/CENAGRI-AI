import { Link } from "react-router-dom";

type LogoProps = {
  className?: string;
  variant?: "dark" | "light";
};

export default function Logo({ className = "", variant = "dark" }: LogoProps) {
  const leaf = variant === "light" ? "#86efac" : "#16a34a";
  const text = variant === "light" ? "text-white" : "text-forest";

  return (
    <Link to="/" className={`inline-flex items-center gap-2 ${className}`} aria-label="CenAGRI-AI home">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-forest">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 21v-8" stroke={leaf} strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M12 13c0-4 2.6-7 8-7 0 5.2-3.2 7.6-8 7.6Z"
            fill={leaf}
            fillOpacity="0.9"
          />
          <path
            d="M12 15.5C7.9 15.5 4 13 4 6.5c6.2 0 8 3.6 8 9Z"
            fill={leaf}
            fillOpacity="0.5"
          />
        </svg>
      </span>
      <span className={`font-display text-lg font-extrabold tracking-tight ${text}`}>
        CenAGRI<span className="text-brand-600">-AI</span>
      </span>
    </Link>
  );
}

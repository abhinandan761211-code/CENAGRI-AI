import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Role } from "@/types";
import { useLang } from "@/i18n/LanguageContext";

/**
 * Role tile used in "Built for every link in the agri chain".
 *
 * Laid out with CSS grid (see `.role-card` in `styles/landing.css`) rather than
 * a flex row: on phones the image is a fixed 96px column beside the text, and
 * from 640px the card stacks with the image on top. Grid rows/columns are set
 * in one media query, so the image can never grow past its column.
 */
export default function RoleCard({ role }: { role: Role }) {
  const { t } = useLang();
  // `role.title` is the signup value shared with the database; the label shown
  // to the visitor is translated by that key, falling back to the value.
  const name = t(`role.name.${role.title}` as Parameters<typeof t>[0]);
  const description = t(`role.desc.${role.title}` as Parameters<typeof t>[0]);

  return (
    <Link to={role.href} className="role-card landing-card landing-lift group" aria-label={`${name} — ${description}`}>
      <div className="role-card-media">
        <img
          src={role.image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-forest-dark/45 via-transparent to-transparent" />
      </div>

      <div className="role-card-body">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold leading-snug text-forest sm:text-[15px]">{name}</h3>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-brand-600" />
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500 sm:mt-1.5 sm:line-clamp-3">
          {description}
        </p>
        <span className="mt-auto hidden pt-3 text-[12.5px] font-semibold text-brand-700 group-hover:underline sm:inline">
          {t("role.getStarted")}
        </span>
      </div>
    </Link>
  );
}

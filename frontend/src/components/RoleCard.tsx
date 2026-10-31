import { ArrowUpRight } from "lucide-react";
import type { Role } from "@/types";

export default function RoleCard({ role }: { role: Role }) {
  return (
    <a
      href={role.href}
      className="group card flex flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    >
      <div className="relative h-32 overflow-hidden bg-sand">
        <img
          src={role.image}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-forest-dark/35 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-bold text-forest">{role.title}</h3>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-brand-600" />
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
          {role.description}
        </p>
        <span className="mt-3 text-[13px] font-semibold text-brand-700 group-hover:underline">
          Explore solutions
        </span>
      </div>
    </a>
  );
}

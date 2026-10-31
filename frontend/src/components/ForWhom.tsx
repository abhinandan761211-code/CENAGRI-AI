import { ArrowRight } from "lucide-react";
import RoleCard from "./RoleCard";
import { ROLES } from "@/lib/data";

export default function ForWhom() {
  return (
    <section id="for-whom" className="bg-cream py-16 lg:py-20">
      <div className="container-x">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <span className="eyebrow">For whom</span>
            <h2 className="section-title mt-2">Built for every link in the agri chain</h2>
            <p className="mt-3 text-slate-600">
              From the smallholder farmer to the retail shop and the truck that
              connects them — everyone gets a purpose-built workspace.
            </p>
          </div>
          <a href="#solutions" className="btn-outline shrink-0 self-start sm:self-auto">
            View all solutions
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => (
            <RoleCard key={role.title} role={role} />
          ))}
        </div>
      </div>
    </section>
  );
}

import { Navigate, useNavigate } from "react-router-dom";
import { LogOut, Mail, MapPin, Phone } from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { LOCATION_FIELD_NAMES, ROLE_FIELDS } from "@/lib/roleFields";
import { formatLocation } from "@/lib/locations";
import { homeForRole } from "@/lib/roleHome";
import type { UserRole } from "@/types";

export default function Dashboard() {
  const { user, profile, signOut, needsRole, needsDetails } = useAuth();
  const navigate = useNavigate();

  // Google sign-ups (and older accounts) must finish onboarding first.
  if (needsRole || needsDetails) {
    return <Navigate to="/complete-profile?next=/dashboard" replace />;
  }

  // Farmers, buyers, retailers and creators each get a dedicated account page;
  // the remaining roles use this generic profile card.
  const home = homeForRole(profile?.role);
  if (home !== "/dashboard") {
    return <Navigate to={home} replace />;
  }

  const details = profile?.details ?? {};
  // Location gets its own card, so keep it out of the generic field grid.
  const detailFields = (profile?.role && (profile.role in ROLE_FIELDS)
    ? ROLE_FIELDS[profile.role as UserRole]
    : []
  ).filter((f) => details[f.name] && !LOCATION_FIELD_NAMES.includes(f.name));

  const locationLabel = formatLocation(details);

  const name =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Farmer";

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-x flex h-16 items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="container-x py-10">
        <div className="card p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-forest text-xl font-bold text-white">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                initials || "CA"
              )}
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-forest">
                Namaskar, {name.split(" ")[0]} 👋
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Your account is active{profile?.role ? ` as a ${profile.role}` : ""}. Today&apos;s
                field brief will appear here.
              </p>
            </div>
          </div>

          <dl className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Mail className="h-3.5 w-3.5" /> Email
              </dt>
              <dd className="mt-1 truncate text-sm font-medium text-forest">
                {profile?.email ?? user?.email}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Phone className="h-3.5 w-3.5" /> Mobile
              </dt>
              <dd className="mt-1 text-sm font-medium text-forest">
                {profile?.phone || "Not added yet"}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:col-span-2">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> State · District · Village
              </dt>
              <dd className="mt-1 text-sm font-medium text-forest">
                {locationLabel || "Not added yet"}
              </dd>
            </div>
          </dl>

          {detailFields.length > 0 && (
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your {profile?.role} profile
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detailFields.map((field) => (
                  <div
                    key={field.name}
                    className="rounded-lg border border-slate-200 bg-white p-3.5"
                  >
                    <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {field.label}
                    </dt>
                    <dd className="mt-1 break-words text-sm font-medium text-forest">
                      {details[field.name]}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <p className="mt-8 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
            Next up: crop advisories, live mandi prices and weather alerts land here once the
            backend endpoints are connected.
          </p>

          <p className="mt-3 text-xs text-slate-400">
            Wrong role? Sign out and sign in again to pick a different one.
          </p>
        </div>
      </main>
    </div>
  );
}

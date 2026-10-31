import { useNavigate } from "react-router-dom";
import { LogOut, Mail, Phone } from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

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
          </dl>

          <p className="mt-8 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
            Next up: crop advisories, live mandi prices and weather alerts land here once the
            backend endpoints are connected.
          </p>
        </div>
      </main>
    </div>
  );
}

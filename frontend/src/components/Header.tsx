import { useEffect, useState } from "react";
import { ChevronDown, Globe, LayoutDashboard, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "./Logo";
import { NAV_ITEMS } from "@/lib/data";
import { useAuth } from "@/hooks/useAuth";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors ${scrolled ? "border-slate-200 bg-white/95 backdrop-blur" : "border-transparent bg-cream"
        }`}
    >
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${item.active
                  ? "bg-brand-50 text-brand-800"
                  : "text-slate-600 hover:bg-slate-100 hover:text-forest"
                }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 hover:text-forest">
            <Globe className="h-4 w-4" />
            বাংলা
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {loading ? null : user ? (
            <Link to="/dashboard" className="btn-primary">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm font-semibold text-forest hover:text-brand-700">
                Log in
              </Link>
              <Link to="/signup" className="btn-primary">
                Get Started Free
              </Link>
            </>
          )}
        </div>

        <button
          className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-forest lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white lg:hidden">
          <nav className="container-x flex flex-col py-3" aria-label="Mobile">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex items-center gap-3 border-t border-slate-200 pt-3">
              {user ? (
                <Link
                  to="/dashboard"
                  className="btn-primary flex-1"
                  onClick={() => setOpen(false)}
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="btn-outline flex-1" onClick={() => setOpen(false)}>
                    Log in
                  </Link>
                  <Link to="/signup" className="btn-primary flex-1" onClick={() => setOpen(false)}>
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

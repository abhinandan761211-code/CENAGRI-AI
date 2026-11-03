// Temporary harness: renders just the farmer sidebar markup so its layout can
// be screenshotted without a Supabase login. Deleted after verification.
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  BadgeCheck, Bell, CalendarDays, ChevronDown, ClipboardList, CloudSun, Droplets,
  Headphones, Home, Languages, Layers, Lock, MessageSquare, Package, Play,
  ScanLine, ShieldCheck, Sprout, Store, Tractor, TrendingUp, Truck, User, Users,
  Wallet, Warehouse, FileText,
} from "lucide-react";
import "./index.css";

const SIDEBAR_GROUPS = [
  { title: undefined, icon: Home, items: [{ label: "Dashboard", icon: Home }] },
  {
    title: "Farm Management",
    icon: Tractor,
    items: [
      { label: "My Farm", icon: Tractor },
      { label: "Crop Management", icon: Sprout },
      { label: "Crop Calendar", icon: CalendarDays },
      { label: "Farm Activities", icon: ClipboardList },
    ],
  },
  {
    title: "AI & Agriculture",
    icon: Sprout,
    items: [
      { label: "AI Crop Advisory", icon: Sprout },
      { label: "Disease Detection", icon: ScanLine },
      { label: "Soil Health", icon: Layers },
      { label: "Irrigation Management", icon: Droplets },
      { label: "Weather & Alerts", icon: CloudSun },
    ],
  },
  {
    title: "Market & Business",
    icon: TrendingUp,
    items: [
      { label: "Mandi Prices", icon: TrendingUp },
      { label: "Marketplace", icon: Store },
      { label: "My Orders & Sales", icon: ClipboardList },
      { label: "Expenses & Profit", icon: Wallet },
    ],
  },
  {
    title: "Farming Services",
    icon: Package,
    items: [
      { label: "Equipment Rental", icon: Package },
      { label: "Transport Services", icon: Truck },
      { label: "Storage & Warehouse", icon: Warehouse },
      { label: "Farm Labour", icon: Users },
      { label: "Government Schemes", icon: BadgeCheck },
      { label: "Crop Insurance", icon: ShieldCheck },
    ],
  },
  {
    title: "Community",
    icon: Users,
    items: [
      { label: "CenFriend", icon: Users },
      { label: "Kisan Video Hub", icon: Play },
      { label: "Farming Groups", icon: MessageSquare },
      { label: "Messages", icon: MessageSquare },
      { label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "My Account",
    icon: User,
    items: [
      { label: "Profile Overview", icon: User },
      { label: "Personal Information", icon: User },
      { label: "Farming Information", icon: Tractor },
      { label: "My Documents & KYC", icon: FileText },
      { label: "Language Settings", icon: Languages },
      { label: "Notification Settings", icon: Bell },
      { label: "Privacy & Security", icon: Lock },
      { label: "Help & Support", icon: Headphones },
      { label: "Account Management", icon: User },
    ],
  },
];

const OPEN = new Set(["Farm Management"]);

function Preview() {
  return (
    <div className="min-h-screen bg-cream p-6">
      <aside className="w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        <nav className="space-y-1 p-3">
          {SIDEBAR_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            if (!group.title) {
              const item = group.items[0];
              return (
                <button
                  key={item.label}
                  className="flex w-full items-center gap-2.5 rounded-lg bg-brand-700 px-3 py-2 text-left text-[13px] font-medium text-white shadow-sm"
                >
                  <GroupIcon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            }
            return (
              <div key={group.title} className="pt-1">
                <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition hover:bg-slate-100">
                  <GroupIcon className="h-[18px] w-[18px] shrink-0 text-brand-700" />
                  <span className="flex-1 truncate text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    {group.title}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${OPEN.has(group.title!) ? "rotate-180" : ""
                      }`}
                  />
                </button>
                <div className={OPEN.has(group.title!) ? "max-h-96" : "max-h-0 overflow-hidden"}>
                  <div className="mt-0.5 ml-4 space-y-0.5 border-l border-slate-200 pl-2.5">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          key={item.label}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium text-slate-600 hover:bg-slate-100 hover:text-forest"
                        >
                          <ItemIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <Preview />
  </MemoryRouter>
);

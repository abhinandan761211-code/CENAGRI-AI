import { Coins, Gift, Handshake, Link2, Receipt, Wallet } from "lucide-react";
import CreatorShell, { CreatorSection } from "@/components/creator/CreatorShell";

/**
 * Monetization — architecture only.
 *
 * There is no payment provider wired into Kalika yet (no Razorpay/Stripe
 * keys, no payout account, no tax handling). Showing a rupee balance here would
 * be a number a creator could plan around and then not receive, so every block
 * is explicitly marked as coming soon.
 */
const FEATURES = [
  { icon: Wallet, title: "Earnings overview", body: "Balance, estimated payouts and channel revenue split." },
  { icon: Receipt, title: "Revenue reports", body: "Monthly statements per video, category and geography." },
  { icon: Handshake, title: "Brand collaboration", body: "Sponsored placements with agri-input brands and FPOs." },
  { icon: Link2, title: "Affiliate links", body: "Link seeds, tools and inputs; earn on referred sales." },
  { icon: Gift, title: "Creator rewards", body: "Bonuses for verified educational content." },
  { icon: Coins, title: "Payment history", body: "Payout records with bank/UPI settlement status." },
];

export default function CreatorMonetization() {
  return (
    <CreatorShell title="Monetization" subtitle="Earnings and partnerships">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <p className="text-[12px] font-bold text-amber-200">Coming soon</p>
        <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-amber-100/80">
          No payment provider is connected to Kalika yet, so no earnings are being calculated.
          Nothing on this page is a real balance — it describes what will be available once
          payouts, tax handling and creator verification are in place.
        </p>
      </div>

      <CreatorSection title="Planned features">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#16C784]/10 text-[#16C784]">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <p className="creator-heading mt-2 text-[13px] font-semibold">{title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{body}</p>
              <span className="mt-2 inline-block rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </CreatorSection>
    </CreatorShell>
  );
}

import type { ReactNode } from "react";
import { BadgeCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Content for the farmer sidebar entries that have no page of their own yet.
 *
 * Kept out of the pages so the dashboard and every feature page show the exact
 * same, honest answer — what the screen will do and which table or step it is
 * waiting on — instead of each page inventing its own placeholder.
 */
export type FarmerPanelDetail = {
  what: string;
  needs: string;
  go?: { label: string; to: string };
};

export const FARMER_PANEL_DETAILS: Record<string, FarmerPanelDetail> = {
    "Crop Calendar": {
      what: "Sowing, weeding and harvest dates worked out from your crop and sowing day.",
      needs: "The crop calendar is generated from each crop's sowing date. Once your crops are on the My Farm page, dates can be built from them.",
      go: { label: "Open My Farm", to: "/my-farm" },
    },
    "Farm Activities": {
      what: "A log of ploughing, sowing, fertiliser, spraying and harvest work, with dates and costs.",
      needs: "Activity logging needs a farm-activities table that is not created yet. Nothing is recorded or shown until it exists.",
      go: { label: "Open My Farm", to: "/my-farm" },
    },
    "Soil Health": {
      what: "Soil type, pH and nutrient status for each field, with what to add before the next crop.",
      needs: "Soil test results come from a lab report. You can record the soil type of each field now on My Farm; pH and nutrient values need test data.",
      go: { label: "Open My Farm", to: "/my-farm" },
    },
    "Irrigation Management": {
      what: "When and how much to water, based on the crop, soil and the coming week's rain.",
      needs: "Your irrigation source is already on your profile. A watering schedule needs soil-moisture data, which is not connected yet.",
      go: { label: "See weather & rain", to: "/weather" },
    },
    "My Orders & Sales": {
      what: "Everything you have bought and sold on the marketplace, with delivery status.",
      needs: "Orders need the `orders` table from database/supabase/features.sql. Until it is created nothing can be ordered or recorded.",
      go: { label: "Open Marketplace", to: "/marketplace" },
    },
    "Expenses & Profit": {
      what: "Cost per season — seed, fertiliser, labour, water — against what the crop earned.",
      needs: "Profit is calculated from recorded expenses and sales. Expense records are not stored yet, so no figures are shown.",
    },
    "Farm Labour": {
      what: "Find workers for sowing, weeding and harvest, and agree a daily wage.",
      needs: "Labour listings need a workers table and verified profiles. None are connected yet.",
    },
    "Government Schemes": {
      what: "Central and state schemes you may qualify for, with eligibility and last dates.",
      needs: "Scheme eligibility is checked against your state, district and land size. Live scheme data is not connected, so no scheme is listed here.",
      go: { label: "Update my details", to: "/complete-profile?next=/farmer-account" },
    },
    "Crop Insurance": {
      what: "Enrol in PM Fasal Bima Yojana and file a claim when a crop is damaged.",
      needs: "Insurance enrolment and claims are handled by the government portal, not by this app yet. No policy or claim data is stored here.",
      go: { label: "Update my details", to: "/complete-profile?next=/farmer-account" },
    },
    "Farming Groups": {
      what: "Join a group in your block to share machines, labour and market information.",
      needs: "Groups need member data in the database. When that exists, groups in your district will be listed here.",
      go: { label: "Open CenFriend", to: "/cenfriend" },
    },
    "Messages": {
      what: "Direct conversations with sellers, buyers, transporters and advisors.",
      needs: "A messaging table is needed before conversations can be stored or delivered.",
      go: { label: "Ask the AI assistant", to: "/advisory" },
    },
    "Notifications": {
      what: "Weather and price updates for your district.",
      needs: "Your alerts are already in the bell at the top of this page, built from the live forecast and today's mandi prices.",
      go: { label: "See weather & alerts", to: "/weather" },
    },
    "Personal Information": {
      what: "Your name, phone and address.",
      needs: "These details are saved on your profile.",
      go: { label: "Update my details", to: "/complete-profile?next=/farmer-account" },
    },
    "Farming Information": {
      what: "Land size, main crops and irrigation source used for advice and alerts.",
      needs: "These answers come from your profile. Individual fields and their areas live on My Farm.",
      go: { label: "Open My Farm", to: "/my-farm" },
    },
    "My Documents & KYC": {
      what: "Aadhaar, land records and bank details used to verify your account.",
      needs: "Document upload and verification are not connected yet. Nothing you upload here would be verified or stored safely, so the form is not shown.",
    },
    "Language Settings": {
      what: "The language the app and the AI assistant reply in.",
      needs: "You can ask the AI assistant for answers in Bengali, Hindi or English today; a saved app-wide language preference is still to come.",
      go: { label: "Ask in your language", to: "/advisory" },
    },
    "Notification Settings": {
      what: "Choose which weather and price alerts you receive, and how.",
      needs: "Alert delivery (SMS or WhatsApp) needs a notification service that is not connected yet. The in-app bell already works.",
    },
    "Privacy & Security": {
      what: "Password, sign-in devices and who can see your farm data.",
      needs: "Your farms are only visible to your own account. Password changes are handled through the reset-password email link.",
      go: { label: "Reset my password", to: "/forgot-password" },
    },
    "Account Management": {
      what: "Account type, profile and closing your account.",
      needs: "Sign out is available from the gear menu in the header. Changing account type or deleting the account is not available yet.",
    },
  };

export const QUICK_TEXT: Record<string, string> = {
  "Crop Disease Help":
    "Spot a problem on your crop? Start with the symptoms below, then share a photo with the advisory team for a confirmed diagnosis.",
  "Soil Health Tips":
    "Healthy soil is the cheapest yield boost there is. These are the checks worth doing this season.",
  "Farming Schemes":
    "Government support you may qualify for, based on the state and district on your profile.",
  "Market Trends":
    "Where your crops are headed over the next few weeks, based on recent mandi arrivals.",
  "Ask AI Assistant":
    "Ask anything about your crop, weather, or prices in Bengali, Hindi or English. The assistant uses your farm profile for context.",
};

export const QUICK_BULLETS: Record<string, string[]> = {
  "Crop Disease Help": [
    "Yellowing between leaf veins usually means a nutrient deficiency, not disease",
    "Brown spots with a grey centre in paddy often point to blast",
    "Avoid spraying within 24 hours of expected rain",
    "Keep affected leaves away from healthy rows",
  ],
  "Soil Health Tips": [
    "Test pH once a season — most crops prefer 6.0–7.0",
    "Add organic matter every year to hold moisture",
    "Rotate crops to break pest and disease cycles",
    "Avoid tilling wet soil; it compacts badly",
  ],
  "Farming Schemes": [
    "PM-KISAN — income support in three instalments",
    "PM Fasal Bima Yojana — crop insurance",
    "Kisan Credit Card — short-term working capital",
    "Soil Health Card — free soil testing",
  ],
  "Market Trends": [
    "Vegetable prices peak in the 2–3 weeks before a major festival",
    "Arrivals usually rise after a dry spell ends",
    "Grade your produce — graded lots fetch 10–15% more",
    "Check the mandi nearest to you first; freight can outweigh the difference",
  ],
  "Ask AI Assistant": [
    "Describe the field, crop stage and what you have already tried",
    "Ask one clear question at a time for the best answer",
    "Mention the day of sowing for stage-specific advice",
    "Always confirm chemical doses with your local dealer",
  ],
};

export function hasFarmerPanel(name: string) {
  return Boolean(QUICK_TEXT[name]) || Boolean(FARMER_PANEL_DETAILS[name]);
}

/**
 * Body of a sidebar dialog: the guidance bullets for the Quick Actions, or the
 * "what this does / what it still needs" note for a feature that is not built.
 */
export function renderFarmerPanel(name: string, close: () => void): ReactNode {
  return <FarmerPanelBody name={name} close={close} />;
}

function FarmerPanelBody({ name, close }: { name: string; close: () => void }) {
  const navigate = useNavigate();

  if (QUICK_TEXT[name]) {
    return (
      <>
        <p className="text-sm leading-relaxed text-slate-500">{QUICK_TEXT[name]}</p>
        <ul className="mt-4 space-y-2">
          {QUICK_BULLETS[name].map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-slate-500">
              <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={close} className="creator-btn-ghost h-9 px-4 text-xs">
            Close
          </button>
        </div>
      </>
    );
  }

  const detail = FARMER_PANEL_DETAILS[name];
  if (!detail) return null;

  return (
    <>
      <p className="text-sm leading-relaxed text-slate-500">{detail.what}</p>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-100 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Status</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail.needs}</p>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={close} className="creator-btn-ghost h-9 px-4 text-xs">
          Close
        </button>
        {detail.go && (
          <button
            type="button"
            onClick={() => {
              close();
              navigate(detail.go!.to);
            }}
            className="creator-btn-primary h-9 px-4 text-xs"
          >
            {detail.go.label}
          </button>
        )}
      </div>
    </>
  );
}

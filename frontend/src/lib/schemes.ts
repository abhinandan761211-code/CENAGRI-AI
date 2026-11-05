import type { DocumentKind } from "@/lib/farmer";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Banknote,
  Droplets,
  ExternalLink,
  GraduationCap,
  HandHeart,
  ShieldCheck,
  Sprout,
  Tractor,
  Wheat,
} from "lucide-react";

/**
 * Verified links to official government pages for the two policy screens
 * (Schemes, Crop Insurance).
 *
 * Design rules:
 *  • Only `gov.in` / `nic.in` destinations are listed — a farmer following
 *    these must always land on the department that owns the scheme.
 *  • Nothing is fetched or scraped here, so nothing can go stale silently in a
 *    misleading way: each card links OUT to the official page for the current
 *    rules, instead of copying a premium or a deadline into the app.
 *  • The app never says a farmer is eligible for a scheme or that a claim will
 *    be paid. That is a decision of the issuing department / insurer.
 */

export type SchemeLink = {
  id: string;
  name: string;
  shortName: string;
  icon: LucideIcon;
  /** Who it is meant for, in the scheme's own terms. */
  forWhom: string;
  /** One line a farmer can say out loud: what they actually get. */
  benefit: string;
  /** Grouping used by the category filter. */
  category: SchemeCategory;
  /** The documents listed below, and which of them this account already has. */
  documents: SchemeDoc[];
  /** What to do first, in order, at the counter or on the portal. */
  steps: string[];
  /** Where the first step actually happens. */
  applyWhere: string;
  url: string;
  department: string;
};

/** A document the scheme asks for, tied to the upload kind in My Documents. */
export type SchemeDoc = {
  label: string;
  /** `null` when the document is not uploaded in My Documents (e.g. a photo). */
  kind: DocumentKind | null;
};

export const SCHEME_CATEGORIES = [
  "Money support",
  "Credit & loan",
  "Insurance",
  "Soil & irrigation",
  "Machinery",
  "Training",
  "Selling produce",
] as const;

export type SchemeCategory = (typeof SCHEME_CATEGORIES)[number];

export const SCHEMES: SchemeLink[] = [
  {
    id: "pm-kisan",
    name: "Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)",
    shortName: "PM-KISAN",
    icon: HandHeart,
    category: "Money support",
    forWhom: "Small and marginal landholding farmer families, paid in three instalments a year.",
    benefit: "₹6,000 a year paid directly into the bank account, in three instalments of ₹2,000.",
    documents: [
      { label: "Aadhaar", kind: "aadhaar" },
      { label: "Land records", kind: "land_record" },
      { label: "Bank account (Aadhaar-linked)", kind: "bank_passbook" },
    ],
    steps: [
      "Open pmkisan.gov.in and choose “New Farmer Registration”.",
      "Enter Aadhaar, the land details and the bank account number.",
      "The state office checks the details; the village-level officer can verify them in person.",
      "After approval, the instalment is credited to the bank account — check status on the same portal with your registration number.",
    ],
    applyWhere: "pmkisan.gov.in, or your village panchayat / block agriculture office",
    url: "https://pmkisan.gov.in/",
    department: "Ministry of Agriculture & Farmers Welfare",
  },
  {
    id: "kcc",
    name: "Kisan Credit Card (KCC)",
    shortName: "Kisan Credit Card",
    icon: Banknote,
    category: "Credit & loan",
    forWhom: "Farmers needing short-term credit for inputs and cultivation.",
    benefit: "A credit limit for seeds, fertiliser and labour at a low interest rate; repay after harvest.",
    documents: [
      { label: "Aadhaar", kind: "aadhaar" },
      { label: "Land documents", kind: "land_record" },
      { label: "Bank account", kind: "bank_passbook" },
      { label: "Passport photo", kind: null },
    ],
    steps: [
      "Visit the bank branch where you already have an account (or any bank you prefer).",
      "Ask for the KCC application form and fill in the land and crop details.",
      "The bank checks the land records and fixes a credit limit for your land size and crop.",
      "Collect the card / passbook; interest is lowest when the loan is repaid on time.",
    ],
    applyWhere: "Your bank branch (KCC is issued by banks with NABARD support)",
    url: "https://www.nabard.org/content.aspx?id=561",
    department: "NABARD / partner banks",
  },
  {
    id: "pmfby",
    name: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
    shortName: "Crop Insurance",
    icon: ShieldCheck,
    category: "Insurance",
    forWhom: "Farmers growing notified crops in notified areas, for crop-loss cover.",
    benefit: "Cover for notified crops against drought, flood, pest attack and other notified losses.",
    documents: [
      { label: "Aadhaar", kind: "aadhaar" },
      { label: "Land records / tenancy proof", kind: "land_record" },
      { label: "Sowing certificate", kind: null },
      { label: "Bank account", kind: "bank_passbook" },
    ],
    steps: [
      "Check on pmfby.gov.in whether your crop and district are notified for this season, and note the enrolment cut-off date.",
      "Enrol through your bank, a CSC centre, the insurance company or the common service portal.",
      "If the crop is damaged, report it within the window set in the rules — usually 72 hours.",
      "A joint inspection assesses the loss; the claim goes to the bank account in the policy.",
    ],
    applyWhere: "pmfby.gov.in, your bank branch, or a CSC centre",
    url: "https://pmfby.gov.in/",
    department: "Ministry of Agriculture & Farmers Welfare",
  },
  {
    id: "shc",
    name: "Soil Health Card Scheme",
    shortName: "Soil Health Card",
    icon: Sprout,
    category: "Soil & irrigation",
    forWhom: "All farmers — a free soil test and a card with nutrient advice.",
    benefit: "A free soil test and a card that tells you which fertiliser your field actually needs.",
    documents: [
      { label: "Aadhaar", kind: "aadhaar" },
      { label: "Land records", kind: "land_record" },
    ],
    steps: [
      "Ask the block agriculture officer when soil sampling is being done in your village.",
      "A field officer collects a soil sample; give the survey / khasra number of the plot.",
      "The sample is tested at a government soil lab and a card is issued.",
      "Use the card's nutrient advice when buying fertiliser; keep it in My Documents for the next season.",
    ],
    applyWhere: "Block agriculture office / soil testing lab",
    url: "https://soilhealth.dac.gov.in/",
    department: "Department of Agriculture & Cooperation",
  },
  {
    id: "pmksy",
    name: "Pradhan Mantri Krishi Sinchayee Yojana (PMKSY)",
    shortName: "Micro Irrigation",
    icon: Droplets,
    category: "Soil & irrigation",
    forWhom: "Farmers installing drip or sprinkler irrigation (Per Drop More Crop).",
    benefit: "Subsidy on drip / sprinkler systems, so less water and power is used for the same crop.",
    documents: [
      { label: "Aadhaar", kind: "aadhaar" },
      { label: "Land records", kind: "land_record" },
      { label: "Water source details", kind: null },
      { label: "Bank account", kind: "bank_passbook" },
    ],
    steps: [
      "Apply on the state horticulture / agriculture portal specified for your district.",
      "Give the plot details and the water source (borewell, well, canal).",
      "After approval, buy the system from an empanelled supplier and keep the bills.",
      "The subsidy share is credited after installation is inspected.",
    ],
    applyWhere: "State horticulture / agriculture office portal",
    url: "https://pmksy.gov.in/",
    department: "Ministry of Jal Shakti / Agriculture",
  },
  {
    id: "smam",
    name: "Sub-Mission on Agricultural Mechanization (SMAM)",
    shortName: "Farm Machinery Subsidy",
    icon: Tractor,
    category: "Machinery",
    forWhom: "Farmers buying tractors, power tillers and implements with subsidy support.",
    benefit: "Subsidy on machinery and implements, with custom hiring centres for shared use.",
    documents: [
      { label: "Aadhaar", kind: "aadhaar" },
      { label: "Land records", kind: "land_record" },
      { label: "Quotation from dealer", kind: null },
      { label: "Bank account", kind: "bank_passbook" },
    ],
    steps: [
      "Register on the Agri Machinery portal (agrimachinery.nic.in) for your state.",
      "Choose the machine and upload a quotation from an approved dealer.",
      "The application is checked against the state's quota for that machine.",
      "After approval, buy the machine and claim the subsidy with the invoice.",
    ],
    applyWhere: "agrimachinery.nic.in, or the district agriculture office",
    url: "https://agrimachinery.nic.in/",
    department: "Department of Agriculture & Farmers Welfare",
  },
  {
    id: "kvy",
    name: "Krishi Vigyan Kendra (KVK) support",
    shortName: "KVK Training",
    icon: GraduationCap,
    category: "Training",
    forWhom: "Farmers and rural youth wanting training, demonstrations and testing.",
    benefit: "Hands-on training, field demonstrations and soil/water testing at your district KVK.",
    documents: [
      { label: "Aadhaar", kind: "aadhaar" },
      { label: "Farmer ID (if issued)", kind: "farmer_id" },
    ],
    steps: [
      "Find your district KVK on kvk.icar.gov.in.",
      "Ask the office which training courses are running this season.",
      "Register your name and phone number for the course.",
      "Attend the demonstration; most courses are free.",
    ],
    applyWhere: "Your district KVK office",
    url: "https://kvk.icar.gov.in/",
    department: "ICAR",
  },
  {
    id: "enst",
    name: "e-NAM — National Agriculture Market",
    shortName: "e-NAM",
    icon: Wheat,
    category: "Selling produce",
    forWhom: "Farmers selling produce through connected mandis / FPOs online.",
    benefit: "Sell to buyers across mandis and see the price offered, instead of one local price.",
    documents: [
      { label: "Aadhaar", kind: "aadhaar" },
      { label: "Bank account", kind: "bank_passbook" },
      { label: "Mandi registration", kind: null },
    ],
    steps: [
      "Ask at your nearest connected mandi whether your crop is traded on e-NAM.",
      "Register as a farmer (the mandi or a CSC centre can do it for you).",
      "Bring the lot to the mandi; it is weighed and listed online.",
      "Payment is credited to the registered bank account after the sale.",
    ],
    applyWhere: "Your nearest e-NAM connected mandi, or a CSC centre",
    url: "https://www.enam.gov.in/",
    department: "Small Farmers' Agribusiness Consortium",
  },
];

export type InsuranceDoc = {
  title: string;
  steps: string[];
  url: string;
  department: string;
};

export const INSURANCE_STEPS: string[] = [
  "Report the crop loss to your bank, insurance company or the village-level officer within 72 hours of the event — the exact window is set in the scheme rules.",
  "The crop loss is assessed by a joint inspection with the revenue and agriculture department.",
  "Keep the claim number, photographs of the damage and the sowing/land documents ready.",
  "The claim amount is credited to the bank account registered in the policy after approval by the insurer.",
];

export const INSURANCE_LINKS: InsuranceDoc[] = [
  {
    title: "PMFBY — scheme, enrolment and claim portal",
    steps: ["Enrolment window", "Premium rates set per crop and season", "Claim status"],
    url: "https://pmfby.gov.in/",
    department: "Ministry of Agriculture & Farmers Welfare",
  },
  {
    title: "Crop insurance guidelines and notified crops",
    steps: ["Notified crops per state", "Scheme rules and cut-off dates"],
    url: "https://agricoop.nic.in/",
    department: "Department of Agriculture & Cooperation",
  },
];

export const SCHEME_ICON = BadgeCheck;
export const EXTERNAL_ICON = ExternalLink;

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
  /** Documents usually needed — from the official guidelines. */
  documents: string[];
  url: string;
  department: string;
};

export const SCHEMES: SchemeLink[] = [
  {
    id: "pm-kisan",
    name: "Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)",
    shortName: "PM-KISAN",
    icon: HandHeart,
    forWhom: "Small and marginal landholding farmer families, paid in three instalments a year.",
    documents: ["Aadhaar", "Land records", "Bank account (Aadhaar-linked)"],
    url: "https://pmkisan.gov.in/",
    department: "Ministry of Agriculture & Farmers Welfare",
  },
  {
    id: "kcc",
    name: "Kisan Credit Card (KCC)",
    shortName: "Kisan Credit Card",
    icon: Banknote,
    forWhom: "Farmers needing short-term credit for inputs and cultivation.",
    documents: ["Aadhaar", "Land documents", "Bank account", "Passport photo"],
    url: "https://www.nabard.org/content.aspx?id=561",
    department: "NABARD / partner banks",
  },
  {
    id: "pmfby",
    name: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
    shortName: "Crop Insurance",
    icon: ShieldCheck,
    forWhom: "Farmers growing notified crops in notified areas, for crop-loss cover.",
    documents: ["Aadhaar", "Land records / tenancy proof", "Sowing certificate", "Bank account"],
    url: "https://pmfby.gov.in/",
    department: "Ministry of Agriculture & Farmers Welfare",
  },
  {
    id: "shc",
    name: "Soil Health Card Scheme",
    shortName: "Soil Health Card",
    icon: Sprout,
    forWhom: "All farmers — a free soil test and a card with nutrient advice.",
    documents: ["Aadhaar", "Land records"],
    url: "https://soilhealth.dac.gov.in/",
    department: "Department of Agriculture & Cooperation",
  },
  {
    id: "pmksy",
    name: "Pradhan Mantri Krishi Sinchayee Yojana (PMKSY)",
    shortName: "Micro Irrigation",
    icon: Droplets,
    forWhom: "Farmers installing drip or sprinkler irrigation (Per Drop More Crop).",
    documents: ["Aadhaar", "Land records", "Water source details", "Bank account"],
    url: "https://pmksy.gov.in/",
    department: "Ministry of Jal Shakti / Agriculture",
  },
  {
    id: "smam",
    name: "Sub-Mission on Agricultural Mechanization (SMAM)",
    shortName: "Farm Machinery Subsidy",
    icon: Tractor,
    forWhom: "Farmers buying tractors, power tillers and implements with subsidy support.",
    documents: ["Aadhaar", "Land records", "Quotation from dealer", "Bank account"],
    url: "https://agrimachinery.nic.in/",
    department: "Department of Agriculture & Farmers Welfare",
  },
  {
    id: "kvy",
    name: "Krishi Vigyan Kendra (KVK) support",
    shortName: "KVK Training",
    icon: GraduationCap,
    forWhom: "Farmers and rural youth wanting training, demonstrations and testing.",
    documents: ["Aadhaar", "Farmer ID (if issued)"],
    url: "https://kvk.icar.gov.in/",
    department: "ICAR",
  },
  {
    id: "enst",
    name: "e-NAM — National Agriculture Market",
    shortName: "e-NAM",
    icon: Wheat,
    forWhom: "Farmers selling produce through connected mandis / FPOs online.",
    documents: ["Aadhaar", "Bank account", "Mandi registration"],
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

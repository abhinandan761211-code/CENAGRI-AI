import type { Feature, NavItem, Role, VideoCard } from "@/types";

/** Header links. `id` is the section each link scrolls to on this page. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "#home", active: true },
  { label: "Modules", href: "#solutions" },
  { label: "AI", href: "#ai" },
  { label: "For Whom", href: "#for-whom" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Videos", href: "#resources" },
  { label: "FAQ", href: "#faq" },
];

/**
 * The account types the platform actually supports. `signupRole` is the value
 * the signup form expects, so the card can skip the "pick your role" step.
 */
export const ROLES: Role[] = [
  {
    title: "Farmer",
    description: "Crop advice, weather alerts, mandi prices and buyers — in your own language.",
    image: "/images/role-farmer.jpg",
    href: "/signup?role=Farmer",
    signupRole: "Farmer",
  },
  {
    title: "Buyer",
    description: "Source graded produce straight from verified farms, with agreed prices.",
    image: "/images/role-buyer.jpg",
    href: "/signup?role=Buyer",
    signupRole: "Buyer",
  },
  {
    title: "Shop / Retailer",
    description: "Keep shelves stocked with in-season produce and track your margins.",
    image: "/images/role-shop.jpg",
    href: "/signup?role=Retailer",
    signupRole: "Retailer",
  },
  {
    title: "Worker / Labour",
    description: "Find farm work nearby, agree a fair wage and build a verified work record.",
    image: "/images/role-worker.jpg",
    href: "/signup?role=Worker",
    signupRole: "Worker",
  },
  {
    title: "Equipment Owner",
    description: "Rent out tractors, pumps and harvesters to farmers who need them today.",
    image: "/images/role-equipment.jpg",
    href: "/signup?role=Equipment",
    signupRole: "Equipment",
  },
  {
    title: "Transporter",
    description: "Match your vehicle with farm loads and get paid per trip, on time.",
    image: "/images/role-transporter.jpg",
    href: "/signup?role=Transporter",
    signupRole: "Transporter",
  },
  {
    title: "Warehouse",
    description: "List cold storage and godown space with live occupancy and bookings.",
    image: "/images/role-warehouse.jpg",
    href: "/signup?role=Warehouse",
    signupRole: "Warehouse",
  },
  {
    title: "Content Creator",
    description: "Share farming knowledge on Kisan Video Hub and earn from what you teach.",
    image: "/images/role-creator.jpg",
    href: "/signup?role=Content%20Creator",
    signupRole: "Content Creator",
  },
];

export const WHY_CHOOSE: Feature[] = [
  {
    icon: "compass",
    title: "Field-Level Precision",
    description:
      "Advice tuned to your block, soil type and crop stage — not generic statewide averages.",
  },
  {
    icon: "chat",
    title: "Works in Bengali",
    description:
      "Ask a question in your own language and get an answer a farmer can act on. Bengali, Hindi and English.",
  },
  {
    icon: "shield",
    title: "Trusted Data",
    description:
      "Built on IMD weather feeds, ICAR advisories and verified mandi price sources.",
  },
  {
    icon: "logo",
    title: "One Platform, Zero Hassle",
    description:
      "Weather, prices, advisory, buyers and logistics together — no more juggling five apps.",
  },
];

export const VIDEOS: VideoCard[] = [
  { title: "AI advisory walkthrough", duration: "02:14", image: "/images/video-1.jpg" },
  { title: "Find a buyer in 3 taps", duration: "01:38", image: "/images/video-2.jpg" },
  { title: "Rent equipment safely", duration: "03:05", image: "/images/video-3.jpg" },
  { title: "Weather alerts explained", duration: "02:47", image: "/images/video-4.jpg" },
];

// The landing page used to export a `TESTIMONIALS` array here with three named
// people and five-star ratings. None of it was real. It has been deleted rather
// than left unused, so it cannot be re-imported by accident. Real reviews live
// against real bookings in the database and are published only with consent.

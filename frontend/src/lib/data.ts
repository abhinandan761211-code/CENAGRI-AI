import type { Feature, NavItem, Role, VideoCard } from "@/types";

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "#home", active: true },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Solutions", href: "#solutions" },
  { label: "For Whom", href: "#for-whom" },
  { label: "Success Stories", href: "#stories" },
  { label: "Resources", href: "#resources" },
];

export const ROLES: Role[] = [
  {
    title: "Farmer",
    description: "Get crop advice, weather alerts and market prices in Bengali — right on your phone.",
    image: "/images/role-farmer.jpg",
    href: "#for-farmer",
  },
  {
    title: "Buyer",
    description: "Source fresh produce directly from verified farms with transparent pricing.",
    image: "/images/role-buyer.jpg",
    href: "#for-buyer",
  },
  {
    title: "Shop / Retailer",
    description: "Keep shelves stocked with in-season produce and set competitive retail prices.",
    image: "/images/role-shop.jpg",
    href: "#for-shop",
  },
  {
    title: "Worker / Labour",
    description: "Find farm work nearby, negotiate fair wages and build a verified work record.",
    image: "/images/role-worker.jpg",
    href: "#for-worker",
  },
  {
    title: "Equipment Owner",
    description: "Rent out tractors, pumps and harvesters to farmers who need them today.",
    image: "/images/role-equipment.jpg",
    href: "#for-equipment",
  },
  {
    title: "Transporter",
    description: "Match your vehicle with farm loads and get paid per trip, on time.",
    image: "/images/role-transporter.jpg",
    href: "#for-transporter",
  },
  {
    title: "Warehouse",
    description: "List cold storage and godown space with live occupancy and booking.",
    image: "/images/role-warehouse.jpg",
    href: "#for-warehouse",
  },
  {
    title: "Content Creator",
    description: "Share farming knowledge and earn from content that reaches real growers.",
    image: "/images/role-creator.jpg",
    href: "#for-creator",
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
      "Ask questions in your own language, by voice or text, and get answers a farmer can act on.",
  },
  {
    icon: "shield",
    title: "Trusted Data",
    description:
      "Powered by ICAR advisories, IMD weather feeds and verified mandi price sources.",
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

export const TESTIMONIALS = [
  {
    quote:
      "আগে বাজারে দাম জানতে অনেক দূর যেতে হতো। এখন CenAGRI-AI থেকে প্রতিদিন সকালে পাই দাম আর পরামর্শ।",
    name: "Anil Mondal",
    role: "Paddy farmer, Bardhaman",
    initials: "AM",
  },
  {
    quote:
      "We source tomatoes from 40 farms through the platform now. Quality grading and payments are predictable.",
    name: "Priya Sharma",
    role: "Fresh produce buyer, Kolkata",
    initials: "PS",
  },
  {
    quote:
      "Equipment rental used to be word of mouth. Now I book a harvester in minutes and rates are fixed upfront.",
    name: "Gopal Das",
    role: "Farmer, Nadia district",
    initials: "GD",
  },
];

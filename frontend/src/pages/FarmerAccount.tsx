import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
    ArrowRight,
    ArrowUp,
    ArrowDown,
    BadgeCheck,
    Bell,
    BookOpen,
    ChevronDown,
    CloudSun,
    Droplets,
    Headphones,
    Home,
    Leaf,
    MapPin,
    Menu,
    MessageSquare,
    Play,
    Search,
    Settings,
    ShoppingBag,
    Sprout,
    Store,
    ThumbsUp,
    TrendingUp,
    Truck,
    Users,
    Warehouse,
    Wind,
    X,
    LogOut,
    Package,
    Tractor,
    CalendarDays,
} from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { LOCATION_FIELD_NAMES, ROLE_FIELDS } from "@/lib/roleFields";
import { formatLocation } from "@/lib/locations";
import type { UserRole } from "@/types";

type TabKey = "farms" | "crops" | "orders";

type MandiRow = {
    commodity: string;
    mandi: string;
    price: number;
    change: number;
    group: "Top Commodities" | "Vegetables" | "Grains" | "Fruits";
};

const MANDI_ROWS: MandiRow[] = [
    { commodity: "Tomato", mandi: "Nashik", price: 2122, change: 3.2, group: "Top Commodities" },
    { commodity: "Onion", mandi: "Lasalgaon", price: 1870, change: -1.5, group: "Top Commodities" },
    { commodity: "Potato", mandi: "Agra", price: 1540, change: 0.7, group: "Top Commodities" },
    { commodity: "Rice", mandi: "Raipur", price: 2458, change: 1.1, group: "Top Commodities" },
    { commodity: "Wheat", mandi: "Indore", price: 2360, change: -0.3, group: "Top Commodities" },
    { commodity: "Brinjal", mandi: "Barasat", price: 1980, change: 2.4, group: "Vegetables" },
    { commodity: "Cauliflower", mandi: "Hooghly", price: 1720, change: -0.8, group: "Vegetables" },
    { commodity: "Cabbage", mandi: "Kolkata", price: 1340, change: 1.9, group: "Vegetables" },
    { commodity: "Maize", mandi: "Davangere", price: 2210, change: 0.4, group: "Grains" },
    { commodity: "Mustard", mandi: "Bardhaman", price: 5310, change: 1.6, group: "Grains" },
    { commodity: "Mango", mandi: "Malda", price: 4200, change: 2.8, group: "Fruits" },
    { commodity: "Banana", mandi: "Jalgaon", price: 1650, change: -2.1, group: "Fruits" },
];

const MANDI_TABS = ["Top Commodities", "Vegetables", "Grains", "Fruits"] as const;

const FORECAST = [
    { day: "Mon", temp: 26, icon: "rain" },
    { day: "Tue", temp: 27, icon: "sun" },
    { day: "Wed", temp: 28, icon: "cloud" },
    { day: "Thu", temp: 29, icon: "sun" },
    { day: "Fri", temp: 27, icon: "rain" },
] as const;

const TRENDING = [
    { title: "Organic Farming Complete Guide", poster: "/images/video-1.jpg", time: "10:15", views: "523K views", views2: "5 days ago", likes: "24K", comments: 688 },
    { title: "Tractor Maintenance Tips", poster: "/images/video-2.jpg", time: "7:32", views: "421K views", views2: "6 days ago", likes: "18K", comments: 420 },
    { title: "Best Fertilizer for Healthy Crops", poster: "/images/video-3.jpg", time: "12:20", views: "389K views", views2: "1 week ago", likes: "16K", comments: 377 },
    { title: "Smart Irrigation System", poster: "/images/video-4.jpg", time: "9:45", views: "278K views", views2: "1 week ago", likes: "14K", comments: 298 },
];

const NAV_ITEMS = [
    { label: "Dashboard", icon: Home, active: true },
    { label: "My Farm", icon: Tractor, active: false },
    { label: "AI Crop Advisory", icon: Sprout, active: false },
    { label: "Mandi Prices", icon: TrendingUp, active: false },
    { label: "Weather & Alerts", icon: CloudSun, active: false },
    { label: "Marketplace", icon: Store, active: false },
    { label: "CenFriend", icon: Users, active: false },
    { label: "Equipment Rental", icon: Package, active: false },
    { label: "Kisan Video Hub", icon: Play, active: false },
    { label: "Transport Services", icon: Truck, active: false },
    { label: "Storage & Warehouse", icon: Warehouse, active: false },
];

const QUICK_LINKS = [
    { label: "Crop Disease Help", icon: Leaf },
    { label: "Soil Health Tips", icon: Sprout },
    { label: "Farming Schemes", icon: BadgeCheck },
    { label: "Market Trends", icon: TrendingUp },
    { label: "Ask AI Assistant", icon: MessageSquare },
];

const inr = (value: number) => `₹ ${value.toLocaleString("en-IN")}`;

function SectionHead({
    title,
    icon,
    action,
}: {
    title: string;
    icon?: React.ReactNode;
    action?: string;
}) {
    return (
        <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-forest">
                {icon}
                {title}
            </h2>
            {action && (
                <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
                >
                    {action} <ArrowRight className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}

function WeatherGlyph({ kind }: { kind: "sun" | "cloud" | "rain" }) {
    return (
        <svg width="34" height="28" viewBox="0 0 34 28" aria-hidden="true">
            {kind !== "rain" && (
                <circle cx={kind === "cloud" ? 13 : 18} cy="9" r="6" fill="#fbbf24" opacity="0.9" />
            )}
            <ellipse cx="18" cy="19" rx="11" ry="7" fill="#cbd5e1" />
            <ellipse cx="12" cy="20" rx="7" ry="5" fill="#e2e8f0" />
            {kind === "rain" && (
                <>
                    <line x1="13" y1="26" x2="11" y2="30" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
                    <line x1="19" y1="26" x2="17" y2="30" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
                    <line x1="25" y1="26" x2="23" y2="30" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
                </>
            )}
        </svg>
    );
}


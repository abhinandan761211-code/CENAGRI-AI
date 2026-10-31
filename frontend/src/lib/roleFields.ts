import type { UserRole } from "@/types";

export type FieldType = "text" | "select" | "number" | "tel";

export type RoleField = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: readonly string[];
};

/** West Bengal districts — the launch market. */
export const WB_DISTRICTS = [
  "Alipurduar",
  "Bankura",
  "Birbhum",
  "Cooch Behar",
  "Dakshin Dinajpur",
  "Darjeeling",
  "Hooghly",
  "Howrah",
  "Jalpaiguri",
  "Jhargram",
  "Kalimpong",
  "Kolkata",
  "Malda",
  "Murshidabad",
  "Nadia",
  "North 24 Parganas",
  "Paschim Bardhaman",
  "Paschim Medinipur",
  "Purba Bardhaman",
  "Purba Medinipur",
  "Purulia",
  "South 24 Parganas",
  "Uttar Dinajpur",
] as const;

const DISTRICT: RoleField = {
  name: "district",
  label: "District",
  type: "select",
  required: true,
  options: WB_DISTRICTS,
};

/**
 * Extra questions asked once the user picks their role. Every answer is stored
 * in `profiles.details` (jsonb) so new questions never need a migration.
 */
export const ROLE_FIELDS: Record<UserRole, readonly RoleField[]> = {
  Farmer: [
    DISTRICT,
    {
      name: "village",
      label: "Village / Block",
      type: "text",
      placeholder: "e.g. Ketugram, Katwa",
      required: true,
    },
    {
      name: "land_size",
      label: "Land size (acres)",
      type: "number",
      placeholder: "e.g. 2.5",
      hint: "Roughly — you can change this later.",
    },
    {
      name: "main_crops",
      label: "Main crops",
      type: "text",
      placeholder: "e.g. Paddy, Potato, Mustard",
      required: true,
    },
    {
      name: "irrigation",
      label: "Irrigation",
      type: "select",
      options: ["Rain-fed only", "Canal", "Deep tubewell", "Shallow tubewell", "River pump", "Other"],
    },
  ],

  Buyer: [
    DISTRICT,
    {
      name: "business_name",
      label: "Business / firm name",
      type: "text",
      placeholder: "e.g. Sharma Fresh Produce",
    },
    {
      name: "buys",
      label: "What do you buy?",
      type: "text",
      placeholder: "e.g. Tomatoes, Cauliflower, Paddy",
      required: true,
    },
    {
      name: "volume",
      label: "Typical volume",
      type: "select",
      options: ["Under 1 ton / week", "1–5 ton / week", "5–20 ton / week", "20+ ton / week"],
    },
  ],

  Shop: [
    DISTRICT,
    {
      name: "shop_name",
      label: "Shop name",
      type: "text",
      placeholder: "e.g. Mondal Bhandar",
      required: true,
    },
    {
      name: "shop_type",
      label: "Shop type",
      type: "select",
      options: ["Vegetable / fruit retail", "Grocery", "Agri-input (seed & fertiliser)", "Wholesale", "Other"],
    },
  ],

  Worker: [
    DISTRICT,
    {
      name: "skills",
      label: "Work you do",
      type: "text",
      placeholder: "e.g. Harvesting, Transplanting, Spraying",
      required: true,
    },
    {
      name: "daily_wage",
      label: "Expected daily wage (₹)",
      type: "number",
      placeholder: "e.g. 450",
    },
    {
      name: "availability",
      label: "Availability",
      type: "select",
      options: ["Full time", "Seasonal", "Weekends only", "On call"],
    },
  ],

  Equipment: [
    DISTRICT,
    {
      name: "equipment_types",
      label: "Equipment you own",
      type: "text",
      placeholder: "e.g. Tractor, Power tiller, Harvester, Pump",
      required: true,
    },
    {
      name: "rent_rate",
      label: "Rent (₹ per day)",
      type: "number",
      placeholder: "e.g. 1800",
    },
  ],

  Transporter: [
    DISTRICT,
    {
      name: "vehicle_type",
      label: "Vehicle type",
      type: "select",
      required: true,
      options: ["Pickup (Tata Ace etc.)", "Mini truck", "Truck (10 ton+)", "Tractor-trolley", "Refrigerated van"],
    },
    {
      name: "capacity",
      label: "Capacity",
      type: "select",
      options: ["Up to 1 ton", "1–3 ton", "3–10 ton", "10 ton+"],
    },
    {
      name: "service_area",
      label: "Service area",
      type: "text",
      placeholder: "e.g. Bardhaman, Hooghly, Kolkata",
    },
  ],

  Warehouse: [
    DISTRICT,
    {
      name: "warehouse_name",
      label: "Warehouse / godown name",
      type: "text",
      placeholder: "e.g. Das Cold Storage",
      required: true,
    },
    {
      name: "storage_type",
      label: "Storage type",
      type: "select",
      options: ["Dry godown", "Cold storage", "CA store", "Open yard"],
    },
    {
      name: "capacity",
      label: "Capacity (metric tons)",
      type: "number",
      placeholder: "e.g. 500",
    },
  ],

  "Content Creator": [
    DISTRICT,
    {
      name: "platforms",
      label: "Where do you publish?",
      type: "text",
      placeholder: "e.g. YouTube, Facebook, Instagram",
    },
    {
      name: "niche",
      label: "Your topic",
      type: "select",
      options: ["Crop growing tips", "Machinery & tech", "Market & prices", "Vlogs / lifestyle", "Other"],
    },
  ],
};

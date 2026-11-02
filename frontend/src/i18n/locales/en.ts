/**
 * English strings — the master list.
 *
 * Every other locale file mirrors these keys. `t()` falls back to this file
 * when a key is missing, so a half-finished translation never shows a raw key
 * on screen. Lists are `readonly string[]` and read with `tList()`.
 */
const en = {
  // ── Shared ──────────────────────────────────────────────────────────────
  "common.brand": "CenAGRI-AI",
  "common.language": "Language",
  "common.changeLanguage": "Change language",
  "common.more": "More",
  "common.coming": "soon",
  "common.close": "Close",

  // ── Header ──────────────────────────────────────────────────────────────
  "nav.home": "Home",
  "nav.modules": "Modules",
  "nav.ai": "AI",
  "nav.forWhom": "For Whom",
  "nav.howItWorks": "How It Works",
  "nav.videos": "Videos",
  "nav.faq": "FAQ",
  "header.login": "Log in",
  "header.getStarted": "Get started",
  "header.dashboard": "Dashboard",
  "header.goToDashboard": "Go to dashboard",
  "header.openMenu": "Open menu",
  "header.closeMenu": "Close menu",

  // ── Hero ────────────────────────────────────────────────────────────────
  "hero.badge": "Built for Indian farms",
  "hero.title1": "Smart Agriculture. Better Farming.",
  "hero.title2": "Stronger Future.",
  "hero.subtitle":
    "One connected platform for farmers, buyers, retailers, workers, transporters, equipment owners, storage providers and the entire agricultural ecosystem.",
  "hero.cta": "Get Started",
  "hero.explore": "Explore Platform",
  "hero.proof1Label": "Account types, one login",
  "hero.proof2Label": "Languages supported",
  "hero.proof3Label": "For farmers to start",
  "hero.previewTitle": "Today on your farm",
  "hero.previewPlace": "Ranaghat, Nadia",
  "hero.sample": "Sample",
  "hero.advisory": "Advisory",
  "hero.advisoryBangla": "বৃষ্টির সম্ভাবনা ৭০% — আজ সেচ দেওয়া থেকে বিরত থাকুন।",
  "hero.advisoryBody":
    "Rain likely this evening. Hold irrigation; the field will keep enough moisture for the next two days.",
  "hero.forecast": "4-day forecast",
  "hero.today": "Today",
  "hero.tue": "Tue",
  "hero.wed": "Wed",
  "hero.thu": "Thu",
  "hero.mandi": "Mandi prices",
  "hero.crop1": "Paddy (Common)",
  "hero.crop2": "Potato",
  "hero.crop3": "Mustard",
  "hero.disclaimer": "Illustrative sample, not live market data.",
  "hero.ariaPreview": "Illustrative preview of the CenAGRI-AI advisory screen",

  // ── Trust strip ─────────────────────────────────────────────────────────
  "trust.heading": "Built on trusted Indian data",
  "trust.aria": "Data sources",
  "trust.items": [
    "IMD Weather",
    "ICAR Advisories",
    "Mandi Prices",
    "Logistics Partners",
    "Verified Buyers",
    "Verified Profiles",
    "Soil Health Cards",
  ],

  // ── Platform stats ──────────────────────────────────────────────────────
  "stats.aria": "Platform at a glance",
  "stats.types": "Account types",
  "stats.typesHint": "Farmer to content creator",
  "stats.modules": "Connected modules",
  "stats.modulesHint": "Advisory, market, logistics",
  "stats.equipment": "Equipment groups",
  "stats.equipmentHint": "Tractor to drone",
  "stats.languages": "Indian languages",
  "stats.languagesHint": "অসমীয়া, বাংলা, हिन्दी, தமிழ்…",
  "stats.footnote":
    "Product facts, not usage figures. Registration and activity counts are published only when a verified metrics feed exists.",

  // ── For whom ────────────────────────────────────────────────────────────
  "forWhom.eyebrow": "For whom",
  "forWhom.title": "Built for every link in the agri chain",
  "forWhom.body":
    "From the smallholder farmer to the retail shop and the truck that connects them — everyone gets a purpose-built workspace, not a generic dashboard.",
  "forWhom.viewAll": "View all solutions",
  "role.getStarted": "Get started",
  "role.name.Farmer": "Farmer",
  "role.name.Buyer": "Buyer",
  "role.name.Retailer": "Shop / Retailer",
  "role.name.Worker": "Worker / Labour",
  "role.name.Equipment": "Equipment Owner",
  "role.name.Transporter": "Transporter",
  "role.name.Warehouse": "Warehouse",
  "role.name.Content Creator": "Content Creator",
  "role.desc.Farmer":
    "Crop advice, weather alerts, mandi prices and buyers — in your own language.",
  "role.desc.Buyer": "Source graded produce straight from verified farms, with agreed prices.",
  "role.desc.Retailer": "Keep shelves stocked with in-season produce and track your margins.",
  "role.desc.Worker":
    "Find farm work nearby, agree a fair wage and build a verified work record.",
  "role.desc.Equipment":
    "Rent out tractors, pumps and harvesters to farmers who need them today.",
  "role.desc.Transporter": "Match your vehicle with farm loads and get paid per trip, on time.",
  "role.desc.Warehouse":
    "List cold storage and godown space with live occupancy and bookings.",
  "role.desc.Content Creator":
    "Share farming knowledge on Kisan Video Hub and earn from what you teach.",

  // ── Why choose ──────────────────────────────────────────────────────────
  "why.eyebrow": "Why choose CenAGRI-AI",
  "why.title": "Advice you can actually act on",
  "why.body":
    "Most agri apps give you data. We give you the next step — specific to your field, your crop and your district.",
  "why.1Title": "Field-Level Precision",
  "why.1Body":
    "Advice tuned to your block, soil type and crop stage — not generic statewide averages.",
  "why.2Title": "Works in your language",
  "why.2Body":
    "Ask a question in your own language and get an answer a farmer can act on — 22 Indian languages.",
  "why.3Title": "Trusted Data",
  "why.3Body": "Built on IMD weather feeds, ICAR advisories and verified mandi price sources.",
  "why.4Title": "One Platform, Zero Hassle",
  "why.4Body":
    "Weather, prices, advisory, buyers and logistics together — no more juggling five apps.",
  "modules.badge": "Modules",
  "modules.title": "Everything in one account",
  "modules.plans": "Included on every plan",
  "modules.advisoryTitle": "AI Crop Advisory",
  "modules.advisoryBody":
    "Ask about pests, disease or dosing and get a field-specific answer in your language.",
  "modules.pricesTitle": "Mandi Prices",
  "modules.pricesBody":
    "Rates from the mandis nearest to your district, in one place — no travel needed to check.",
  "modules.weatherTitle": "Weather & Alerts",
  "modules.weatherBody":
    "Rain, heat and wind warnings for your block, with what to do about each one.",
  "modules.marketplaceTitle": "Marketplace",
  "modules.marketplaceBody":
    "List produce, compare buyers and settle at an agreed grade and price.",
  "modules.farmTitle": "My Farm",
  "modules.farmBody": "Fields, areas, soil type and crops in one record that powers every alert.",
  "modules.equipmentTitle": "Equipment & Labour",
  "modules.equipmentBody":
    "Book a tractor, harvester or a crew for the day — with fixed upfront rates.",
  "modules.transportTitle": "Transport",
  "modules.transportBody": "Match a truck to your load and track it from field to mandi.",
  "modules.storageTitle": "Storage",
  "modules.storageBody":
    "Find cold storage and godown space with real occupancy before harvest.",

  // ── AI section ──────────────────────────────────────────────────────────
  "ai.eyebrow": "AI advisory",
  "ai.title1": "Advice that knows your field,",
  "ai.title2": "not the average one.",
  "ai.body":
    "Generic tips are useless when it rained last night in your block and not in the next one. CenAGRI AI combines your crop, location and weather into a single, specific answer.",
  "ai.cap1Title": "Crop advisory in plain language",
  "ai.cap1Body":
    "Ask about pests, disease, dosing or timing and get an answer built from your crop, your district and the current weather.",
  "ai.cap2Title": "Weather-aware recommendations",
  "ai.cap2Body":
    "Irrigation and spraying advice accounts for rain, heat and wind for your block — so the answer fits today, not a textbook.",
  "ai.cap3Title": "22 Indian languages",
  "ai.cap3Body":
    "Ask and read in the language you think in — from Bengali and Hindi to Tamil, Telugu, Marathi and more.",
  "ai.cap4Title": "Honest about its source",
  "ai.cap4Body":
    "When the server is not configured for a model, it answers from curated rules and says so on screen. You always know what you are reading.",
  "ai.cta": "Try the advisory",
  "ai.notYet": "Not available yet",
  "ai.notYetBody":
    "These are on the roadmap. They are listed here so nobody registers expecting them today.",
  "ai.notYet1": "Photo-based disease detection",
  "ai.notYet2": "Voice input and spoken answers",
  "ai.notYet3": "Yield prediction from satellite imagery",
  "ai.live": "What is live today",
  "ai.liveBody":
    "Text advisory grounded in crop, district and weather context, with a clear label when an answer comes from rules rather than a model.",

  // ── How it works ────────────────────────────────────────────────────────
  "how.eyebrow": "How it works",
  "how.title": "Three steps from field to decision",
  "how.body":
    "No training required. If you can send a WhatsApp message, you can use CenAGRI-AI.",
  "how.step1Title": "Create your profile",
  "how.step1Body":
    "Pick your role, your block and your crops. Takes under two minutes, works on any phone.",
  "how.step1Detail": "Name · District · Crops",
  "how.step2Title": "Get your daily brief",
  "how.step2Body":
    "Weather, pest risk, irrigation advice and today's market rate — every morning, in your language.",
  "how.step2Detail": "Weather · Advisory · Prices",
  "how.step3Title": "Act with confidence",
  "how.step3Body":
    "Ask the AI in your own words, compare buyers, book equipment or a truck, and track results.",
  "how.step3Detail": "Ask · Compare · Book",

  // ── Videos ──────────────────────────────────────────────────────────────
  "videos.eyebrow": "Watch & learn",
  "videos.title": "Short guides, made for real use",
  "videos.body":
    "Two-minute walkthroughs in your language, filmed with farmers who use CenAGRI-AI every day.",
  "videos.openHub": "Open Kisan Video Hub",
  "videos.v1": "AI advisory walkthrough",
  "videos.v2": "Find a buyer in 3 taps",
  "videos.v3": "Rent equipment safely",
  "videos.v4": "Weather alerts explained",

  // ── Testimonials ────────────────────────────────────────────────────────
  "story.eyebrow": "Success stories",
  "story.title": "Real stories only — nothing invented",
  "story.body":
    "We publish a testimonial once a verified account has actually used the platform and agreed to share their experience. Until then, this space stays honest.",
  "story.noneTitle": "No verified testimonials published yet",
  "story.noneBody":
    "Verified reviews appear inside the app against the booking they came from — that is what makes them trustworthy. They are not copied onto this page until the person agrees.",
  "story.cta": "Be among the first",

  // ── FAQ ─────────────────────────────────────────────────────────────────
  "faq.eyebrow": "Questions",
  "faq.title": "Answers, without the sales pitch",
  "faq.body":
    "If something here is not built yet, it says so. Anything you are unsure about, ask before you rely on it.",
  "faq.cta": "Create an account",
  "faq.q1": "What is CenAGRI AI?",
  "faq.a1":
    "A connected agriculture platform. One account gives a farmer, buyer, retailer, worker, transporter, equipment owner, warehouse owner or content creator the tools for their part of the agricultural chain — crop advisory, mandi prices, weather, marketplace, logistics, storage and video learning.",
  "faq.q2": "Who can register?",
  "faq.a2":
    "Anyone in the agricultural chain can create an account and pick a role at signup. The roles are farmer, buyer, retailer, worker, transporter, equipment owner, warehouse owner and content creator. You can start free as a farmer.",
  "faq.q3": "What services are available?",
  "faq.a3":
    "Crop advisory, weather alerts, mandi prices, a produce marketplace, the CenFriend community, equipment rental, transport booking, warehouse and cold-storage booking, and the Kisan Video Hub. Each is its own module inside your dashboard.",
  "faq.q4": "How does the AI advisory actually work?",
  "faq.a4":
    "You ask a question in your own words and it is answered using your crop, district and local weather. The answer is generated by a language model when the server is configured for it. If it is not, the same endpoint returns rule-based guidance and the screen labels it as such — so you always know which you are reading.",
  "faq.q5": "Can it identify a crop disease from a photo?",
  "faq.a5":
    "Not yet. Photo-based disease detection is not implemented, so this page does not offer it. You can still describe symptoms and get advisory guidance. We will add image analysis when it genuinely works.",
  "faq.q6": "How does a buyer connect with a farmer?",
  "faq.a6":
    "Through the marketplace. A farmer lists produce with quantity and grade; buyers browse listings and place orders. Both sides see the same order record, and payment is confirmed by the platform rather than typed in by either party.",
  "faq.q7": "How do I rent agricultural machinery?",
  "faq.a7":
    "Create an equipment-owner account to list tractors, harvesters, seeders, sprayers or drones with a price and working area. Renters search by category and district, request specific dates, and the owner accepts — the system refuses two bookings that overlap those dates.",
  "faq.q8": "How do I find transport for my produce?",
  "faq.a8":
    "Post a transport request with pickup, drop-off and load. Registered transporters see it, send quotations, and you accept one. The trip then has a status you can follow, and delivery proof is recorded when the goods are handed over.",
  "faq.q9": "How do I book warehouse storage?",
  "faq.a9":
    "Warehouse owners list facilities with capacity and rates. You send a storage request, receive a quotation with the full cost breakdown, and accept it. Space is reserved at that point — you cannot be overbooked into a full godown.",
  "faq.q10": "Is Kisan Video Hub free to watch?",
  "faq.a10":
    "Yes. Browsing and watching on the Kisan Video Hub is open to every signed-in account. Creating and publishing videos is available to content-creator accounts.",
  "faq.q11": "Is my data and location shared anywhere?",
  "faq.a11":
    "Each account sees only its own records — the database enforces this per user, not just the screens. Location sharing for live tracking is opt-in per trip, is off by default, and nothing is collected outside an active job.",

  // ── CTA ─────────────────────────────────────────────────────────────────
  "cta.eyebrow": "Free to start",
  "cta.title": "Your next harvest deserves better decisions.",
  "cta.body":
    "One account for the whole agricultural chain — farmers, buyers, retailers, workers, transporters, equipment and warehouse owners. No card needed.",
  "cta.perk1": "Free for farmers",
  "cta.perk2": "Works on any phone",
  "cta.perk3": "22 Indian languages, one tap",
  "cta.create": "Create free account",
  "cta.getApp": "Get the app",

  // ── Footer ──────────────────────────────────────────────────────────────
  "footer.tagline":
    "AI-powered agriculture platform — advisory, mandi prices, marketplace, logistics, equipment and storage in one account.",
  "footer.helpline": "Kisan helpline",
  "footer.email": "Email us",
  "footer.sdg": "Supporting SDG 1, 2 and 8 across rural India.",
  "footer.colPlatform": "Platform",
  "footer.colExplore": "Explore",
  "footer.colAccounts": "Account types",
  "footer.aiAdvisory": "AI advisory",
  "footer.marketplace": "Marketplace",
  "footer.equipmentRental": "Equipment rental",
  "footer.transport": "Transport",
  "footer.warehouseStorage": "Warehouse storage",
  "footer.videoHub": "Kisan Video Hub",
  "footer.howItWorks": "How it works",
  "footer.accountTypes": "Account types",
  "footer.platformFaq": "Platform faq",
  "footer.signIn": "Sign in",
  "footer.createAccount": "Create account",
  "footer.rights": "All rights reserved.",

  // ── Auth layout ─────────────────────────────────────────────────────────
  "auth.brandBadge": "Built for the whole agri chain",
  "auth.brandTitle1": "Every decision, backed by",
  "auth.brandTitle2": " AI that speaks your language.",
  "auth.hl1Title": "Daily field brief",
  "auth.hl1Body":
    "Weather, pest risk and irrigation advice for your exact block — every morning.",
  "auth.hl2Title": "Live mandi prices",
  "auth.hl2Body": "Compare rates across markets before you sell, so you never take a low offer.",
  "auth.hl3Title": "Works in your language",
  "auth.hl3Body":
    "Choose from 22 Indian languages and get an answer you can act on.",
  "auth.bottomNote": "Built for the whole agri chain · Free to start",
  "auth.sdg": "Supporting SDG 1, 2 & 8",
  "auth.backHome": "Back to home",

  // ── Login ───────────────────────────────────────────────────────────────
  "login.title": "Welcome back",
  "login.subtitle": "Sign in to see today's advisory and market rates for your fields.",
  "login.orEmail": "or continue with email",
  "login.email": "Email address",
  "login.emailPlaceholder": "name@farm.com",
  "login.password": "Password",
  "login.remember": "Remember me",
  "login.forgot": "Forgot password?",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.newHere": "New to CenAGRI-AI?",
  "login.create": "Create a free account",
  "login.legal": "Protected by encrypted transmission. By signing in you agree to our",
  "login.terms": "Terms",
  "login.and": "and",
  "login.privacy": "Privacy Policy",
  "login.errEmailRequired": "Enter your email address.",
  "login.errEmailInvalid": "That doesn't look like a valid email.",
  "login.errPasswordRequired": "Enter your password.",
  "login.errFailed": "Sign-in failed. Please check your details.",
  "login.errLink": "That sign-in link is invalid or has expired. Please try again.",

  // ── Signup ──────────────────────────────────────────────────────────────
  "signup.badge": "Free to start · No card needed",
  "signup.title": "Create your account",
  "signup.subtitle":
    "Set up your profile in two minutes and get your first field brief tomorrow morning.",
  "signup.orEmail": "or sign up with email",
  "signup.fullName": "Full name",
  "signup.fullNamePlaceholder": "Anil Mondal",
  "signup.mobile": "Mobile",
  "signup.mobileHint": "Optional",
  "signup.email": "Email address",
  "signup.password": "Password",
  "signup.passwordPlaceholder": "Create a strong password",
  "signup.iam": "I am a…",
  "signup.whereTitle": "Where do you farm / work?",
  "signup.termsText1": "I agree to the",
  "signup.termsLink": "Terms of Use",
  "signup.termsText2":
    "and consent to my data being used to personalise agricultural advice.",
  "signup.submit": "Create free account",
  "signup.submitting": "Creating account…",
  "signup.haveAccount": "Already have an account?",
  "signup.signIn": "Sign in",
  "signup.sentBadge": "Almost there",
  "signup.sentTitle": "Check your email",
  "signup.sentBody1": "We sent a confirmation link to",
  "signup.sentBody2": "Click it to activate your account, then sign in.",
  "signup.sentCta": "Go to sign in",
  "signup.errName": "Enter your full name.",
  "signup.errEmailRequired": "Enter your email address.",
  "signup.errEmailInvalid": "That doesn't look like a valid email.",
  "signup.errPhone": "Enter a 10-digit Indian mobile number.",
  "signup.errPasswordRequired": "Create a password.",
  "signup.errPasswordShort": "Use at least 8 characters.",
  "signup.errRole": "Select the role that fits you best.",
  "signup.errState": "Select your state.",
  "signup.errDistrict": "Select your district.",
  "signup.errVillage": "Select or enter your village / block.",
  "signup.errTerms": "Please accept the terms to continue.",
  "signup.errFix": "Please fix the highlighted fields and try again.",
  "signup.errExists": "An account with this email already exists. Try signing in instead.",
  "signup.errGeneric": "Could not create your account.",

  // ── Location + password fields ──────────────────────────────────────────
  "loc.state": "State",
  "loc.district": "District",
  "loc.village": "Village / Block",
  "loc.optional": "(optional)",
  "loc.selectState": "Select state / UT…",
  "loc.groupLaunch": "Serving now",
  "loc.groupAll": "All states",
  "loc.groupUT": "Union territories",
  "loc.stateHint":
    "Advisories and mandi prices are fullest for West Bengal today — every other state is welcome and being expanded.",
  "loc.selectStateFirst": "Select a state first",
  "loc.selectDistrict": "Select district…",
  "loc.selectDistrictFirst": "Select a district first",
  "loc.selectVillage": "Select village / block…",
  "loc.villagePlaceholder": "e.g. Ketugram, Katwa",
  "loc.villageHint": "Used to pin weather alerts and nearby mandi prices.",
  "pwd.tooWeak": "Too weak",
  "pwd.weak": "Weak",
  "pwd.fair": "Fair",
  "pwd.strong": "Strong",
  "pwd.label": "Password strength:",
  "pwd.tip": "— use 8+ characters with a mix of letters, numbers & symbols.",
  "field.showPassword": "Show password",
  "field.hidePassword": "Hide password",
  "social.signIn": "Sign in with Google",
  "social.signUp": "Sign up with Google",
  "social.unconfigured":
    "Google sign-in is unavailable because Supabase keys are missing. Add them to frontend/.env and restart the dev server.",
  "social.failed": "Could not start Google sign-in.",
};

export type TranslationKey = keyof typeof en;
export default en;

/**
 * QA script: load the farmer account with a mocked Supabase client and report
 * what actually rendered on every community + account page.
 *
 * Run:
 *   node <skill>/browser.mjs http://localhost:5179/ --script ./scripts/qa-farmer.mjs
 */
export default async function run(page, ui) {
  // The mock is chosen by the `?qa=1` flag on every URL this script opens.
  void ui;

  const ROUTES = [
    ["/farmer-account", "Overview"],
    ["/my-farm", "My Farm"],
    ["/crops", "Crop Management"],
    ["/calendar", "Crop Calendar"],
    ["/weather", "Weather & Alerts"],
    ["/soil-health", "Soil Health"],
    ["/irrigation", "Irrigation Management"],
    ["/farm-activities", "Farm Activities"],
    ["/advisory", "AI Crop Advisory"],
    ["/disease-detection", "Disease Detection"],
    ["/mandi", "Mandi Prices"],
    ["/orders-sales", "My Orders & Sales"],
    ["/expenses", "Expenses & Profit"],
    ["/farm-labour", "Farm Labour"],
    ["/schemes", "Government Schemes"],
    ["/crop-insurance", "Crop Insurance"],
    ["/farming-groups", "Farming Groups"],
    ["/messages", "Messages"],
    ["/notifications", "Notifications"],
    ["/account/profile", "My Profile"],
    ["/account/personal", "Personal Information"],
    ["/account/farming", "Farming Information"],
    ["/account/documents", "My Documents & KYC"],
    ["/account/language", "Language Settings"],
    ["/account/notifications", "Notification Settings"],
    ["/account/privacy", "Privacy & Security"],
    ["/account/help", "Help & Support"],
    ["/account/manage", "Account Management"],
  ];

  const report = [];

  for (const [path, label] of ROUTES) {
    const errors = [];
    const onConsole = (msg) => {
      if (msg.type() === "error") errors.push(msg.text().slice(0, 300));
    };
    page.on("console", onConsole);

    await page.goto(`http://localhost:5179${path}${path.includes("?") ? "&" : "?"}qa=1`, { waitUntil: "domcontentloaded" });
    // Wait for the app to mount (React Router renders into #root).
    await page
      .waitForFunction(() => document.querySelector("#root")?.textContent?.trim().length > 40, null, { timeout: 15000 })
      .catch(() => { });

    const probe = await page.evaluate(() => {
      const root = document.querySelector("#root");
      const text = (root?.textContent ?? "").replace(/\s+/g, " ").trim();
      const h1 = document.querySelector("main h1, h1")?.textContent?.trim() ?? "";
      return {
        chars: text.length,
        h1,
        // The shell marks the active sidebar entry with aria-current=page.
        activeNav: document.querySelector('a[aria-current="page"] span')?.textContent?.trim() ?? "",
        navItems: document.querySelectorAll('nav[aria-label="Farmer features"] a').length,
        cards: document.querySelectorAll(".creator-card").length,
        hasSidebar: Boolean(document.querySelector('aside[aria-label="Farmer navigation"]')),
        hasBottomBar: Boolean(document.querySelector('nav[aria-label="Quick sections"]')),
        snippet: text.slice(0, 130),
      };
    });

    page.off("console", onConsole);
    report.push({ path, label, ...probe, errors: errors.slice(0, 3) });
  }

  return report;
}

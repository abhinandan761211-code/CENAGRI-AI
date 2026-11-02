const { chromium } = require("patchright");

const SUPABASE = "https://mqebcxpgwunhjoskddiq.supabase.co";

// Every worker route, in nav order.
const PAGES = [
  ["/worker", "Worker home"],
  ["/worker/jobs", "Find jobs"],
  ["/worker/applications", "My applications"],
  ["/worker/active-work", "Active work"],
  ["/worker/calendar", "Work calendar"],
  ["/worker/profile", "My profile"],
  ["/worker/earnings", "Earnings"],
  ["/worker/reviews", "Reviews"],
  ["/worker/messages", "Messages"],
  ["/worker/notifications", "Notifications"],
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks,LocalNetworkAccessChecks",
      "--disable-web-security",
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));

  const res = await page.request.post(`${SUPABASE}/auth/v1/verify`, {
    headers: { apikey: process.env.ANON_KEY, "Content-Type": "application/json" },
    data: { type: "magiclink", token_hash: process.env.HASHED_TOKEN },
  });
  const session = await res.json();
  if (!res.ok()) {
    console.log(JSON.stringify({ error: res.status(), body: session }));
    await browser.close();
    return;
  }

  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    ["sb-mqebcxpgwunhjoskddiq-auth-token", JSON.stringify(session)]
  );

  const out = [];

  for (const [path, label] of PAGES) {
    const before = errors.length;
    await page.goto(`http://localhost:5173${path}`, { waitUntil: "domcontentloaded" });
    // Wait for the shell to mount (the sidebar is on every worker page).
    let mounted = true;
    try {
      await page.locator('aside[aria-label="Sidebar"]').waitFor({ timeout: 20000 });
    } catch {
      mounted = false;
    }
    await page.waitForTimeout(1200);

    const info = await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        heading: document.querySelector("h1")?.innerText?.trim() ?? "",
        bodyChars: body.length,
        hasSidebar: Boolean(document.querySelector('aside[aria-label="Sidebar"]')),
        // The "not set up" error from a missing table would show this text.
        tableError: /worker tables are not set up/i.test(body),
        emptyState: /No .*(yet|posted|available)/i.test(body),
        sampleNotice: /Sample data/i.test(body),
      };
    });

    out.push({
      path,
      label,
      mounted,
      ...info,
      newErrors: errors.slice(before).filter((e) => !/WebSocket|websocket/i.test(e)),
    });
  }

  console.log(JSON.stringify({ pages: out, totalErrors: errors.filter((e) => !/WebSocket/i.test(e)).length }, null, 2));
  await browser.close();
})();

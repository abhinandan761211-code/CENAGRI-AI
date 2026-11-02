const { chromium } = require("patchright");
const SUPABASE = "https://mqebcxpgwunhjoskddiq.supabase.co";

/**
 * End-to-end worker journey against the real database:
 *   employer posts a job  ->  worker sees it  ->  worker applies
 *   ->  employer accepts  ->  assignment appears in Active Work.
 *
 * The employer is simulated with the service-role key (that is what an
 * employer's own dashboard would do), so this tests the worker UI and the DB
 * triggers together rather than the UI alone.
 */
(async () => {
  const SRK = process.env.SRK;
  const SURL = process.env.SURL;
  const userId = process.env.WORKER_ID;

  const svc = (path, init = {}) =>
    fetch(`${SURL}${path}`, {
      ...init,
      headers: {
        apikey: SRK,
        Authorization: `Bearer ${SRK}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(init.headers || {}),
      },
    });

  // 1. Employer posts a job.
  const jobRes = await svc("/rest/v1/job_listings", {
    method: "POST",
    body: JSON.stringify({
      employer_id: userId, // same id is fine for the test; we only check worker-side reads
      employer_name: "Ramesh Farm (test)",
      employer_verified: true,
      title: "Paddy harvesting — 3 days",
      category: "Harvesting",
      description: "Harvest paddy across 2 acres. Meals provided.",
      village: "Pipra Khurd",
      district: "Supaul",
      state: "Bihar",
      pay_type: "daily",
      wage_inr: 450,
      start_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
      workers_needed: 3,
      required_skills: ["Harvesting", "Sickle work"],
      experience_required: 1,
      work_type: "contract",
      status: "open",
    }),
  });
  const [job] = await jobRes.json();
  if (!jobRes.ok) {
    console.log(JSON.stringify({ step: "post job", status: jobRes.status(), job }));
    return;
  }

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
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const res = await page.request.post(`${SUPABASE}/auth/v1/verify`, {
    headers: { apikey: process.env.ANON_KEY, "Content-Type": "application/json" },
    data: { type: "magiclink", token_hash: process.env.HASHED_TOKEN },
  });
  const session = await res.json();
  await page.addInitScript(
    ([k, v]) => localStorage.setItem(k, v),
    ["sb-mqebcxpgwunhjoskddiq-auth-token", JSON.stringify(session)]
  );

  // 2. The job shows up on the discovery page.
  await page.goto("http://localhost:5173/worker/jobs", { waitUntil: "domcontentloaded" });
  await page.locator('aside[aria-label="Sidebar"]').waitFor({ timeout: 25000 });
  await page.waitForTimeout(1500);
  const onList = await page.getByText("Paddy harvesting — 3 days").count();

  // 3. Open the job and apply through the real UI.
  await page.locator('article', { hasText: "Paddy harvesting — 3 days" }).getByText("View details").click();
  await page.waitForURL(/\/worker\/jobs\/.+/, { timeout: 15000 });
  await page.getByRole("button", { name: /apply for this job/i }).click();
  await page.locator('[role="dialog"]').waitFor({ timeout: 8000 });
  await page.locator('[role="dialog"] textarea').fill("I have harvested paddy for 6 years nearby.");
  await page.getByRole("button", { name: /send application/i }).click();
  await page.getByText(/application sent/i).waitFor({ timeout: 12000 });

  const applied = await svc(`/rest/v1/job_applications?job_id=eq.${job.id}&select=id,status,worker_id`).then((r) => r.json());

  // 4. Duplicate protection: the button must not allow a second apply.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const duplicateBlocked = (await page.getByText(/already applied/i).count()) > 0;

  // 5. Employer accepts -> trigger should create the assignment.
  await svc(`/rest/v1/job_applications?id=eq.${applied[0]?.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "accepted" }),
  });
  const assignments = await svc(`/rest/v1/work_assignments?job_id=eq.${job.id}&select=id,title,status,progress_pct`).then((r) => r.json());

  // 6. Active Work shows it.
  await page.goto("http://localhost:5173/worker/active-work", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const onActiveWork = await page.getByText("Paddy harvesting — 3 days").count();
  const hasAttendanceNote = (await page.getByText(/attendance is marked by the employer/i).count()) > 0;

  // 7. Earnings must stay empty until a payment row exists (never faked).
  await page.goto("http://localhost:5173/worker/earnings", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const earningsEmpty = (await page.getByText(/no payments yet/i).count()) > 0;

  console.log(
    JSON.stringify(
      {
        jobCreated: job.id,
        visibleOnDiscovery: onList > 0,
        applicationRows: applied.map((a) => a.status),
        duplicateBlocked,
        assignmentCreatedByTrigger: assignments,
        visibleOnActiveWork: onActiveWork > 0,
        hasAttendanceNote,
        earningsEmptyBeforePayment: earningsEmpty,
        errors: errors.filter((e) => !/WebSocket/i.test(e)).slice(0, 3),
      },
      null,
      2
    )
  );

  // Clean up so the QA rows do not linger in the real database.
  await svc(`/rest/v1/job_listings?id=eq.${job.id}`, { method: "DELETE" });
  await browser.close();
})();

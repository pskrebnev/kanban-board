import { chromium } from "playwright";

const appUrl = process.env.APP_URL || "http://localhost:3000";

async function waitForHttp(url, label) {
  const deadline = Date.now() + 60_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }

      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`${label} did not become ready: ${lastError?.message}`);
}

await waitForHttp(appUrl, "Frontend");

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(appUrl);
  await page.locator("main").waitFor({ timeout: 20_000 });
  await page.waitForFunction(
    () => document.title.includes("Kanban Ticketing"),
    undefined,
    { timeout: 20_000 },
  );
  console.log("E2E smoke test passed");
} finally {
  await browser.close();
}

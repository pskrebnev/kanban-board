import { chromium } from "playwright";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const appUrl = requireEnv("APP_URL");
const mailpitUrl = process.env.E2E_MAILPIT_URL ?? "http://mailpit:8025";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url: string, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError: Error | undefined;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await sleep(1_000);
  }

  throw new Error(`${label} did not become ready: ${lastError?.message}`);
}

type MailpitList = { messages?: Array<{ ID: string }> };
type MailpitMessage = { Text?: string; HTML?: string };

async function findVerificationToken(email: string): Promise<string> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const query = encodeURIComponent(`to:${email}`);
    const listResponse = await fetch(`${mailpitUrl}/api/v1/search?query=${query}`);

    if (listResponse.ok) {
      const list = (await listResponse.json()) as MailpitList;
      const first = list.messages?.[0];

      if (first) {
        const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${first.ID}`);
        const message = (await messageResponse.json()) as MailpitMessage;
        const body = message.Text ?? message.HTML ?? "";
        const match = body.match(/token=([A-Za-z0-9_-]+)/);

        if (match && match[1]) {
          return match[1];
        }
      }
    }

    await sleep(1_000);
  }

  throw new Error(`No verification email found for ${email}`);
}

await waitForHttp(appUrl, "Frontend");
await waitForHttp(`${mailpitUrl}/api/v1/messages`, "Mailpit");

const email = `e2e-teams+${Date.now()}@example.com`;
const password = "supersecret123";
const teamName = `Team-${Date.now()}`;
const renamedTeam = `${teamName}-renamed`;

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();

  // Sign up, verify, and log in (Teams sits behind authentication).
  await page.goto(`${appUrl}/signup`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.getByText(/check your email/i).waitFor({ timeout: 20_000 });

  const token = await findVerificationToken(email);
  await page.goto(`${appUrl}/verify?token=${encodeURIComponent(token)}`);
  await page.getByText(/email verified/i).waitFor({ timeout: 20_000 });

  await page.goto(`${appUrl}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("heading", { name: "Kanban board" }).waitFor({ timeout: 20_000 });

  // Navigate to the Teams screen from the board header. Use an exact match so
  // the nav button is not confused with the account button (the test email can
  // contain the substring "teams").
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("heading", { name: "Teams", exact: true }).waitFor({ timeout: 20_000 });

  // Create a team.
  await page.getByPlaceholder("New team name").fill(teamName);
  await page.getByRole("button", { name: "Create team" }).click();
  await page.getByText(teamName, { exact: true }).waitFor({ timeout: 20_000 });

  // Rename it inline. Click Rename on this team's row (while its name is still
  // shown), then use the single open edit form. Only one row edits at a time,
  // so `.team-edit input` and the Save button are unambiguous even if other
  // teams already exist.
  await page
    .getByText(teamName, { exact: true })
    .locator("xpath=ancestor::li")
    .getByRole("button", { name: "Rename" })
    .click();
  await page.locator(".team-edit input").fill(renamedTeam);
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText(renamedTeam, { exact: true }).waitFor({ timeout: 20_000 });

  // Delete it (unreferenced, so deletion succeeds). Assert the specific team is
  // gone rather than a global empty state, since teams are shared across users
  // and the database may legitimately contain other teams. The name stays
  // visible while the inline delete confirmation is shown, so the row locator
  // resolves for both the Delete and Confirm clicks.
  const renamedRow = page.getByText(renamedTeam, { exact: true }).locator("xpath=ancestor::li");
  await renamedRow.getByRole("button", { name: "Delete" }).click();
  await renamedRow.getByRole("button", { name: "Confirm" }).click();
  await page.getByText(renamedTeam, { exact: true }).waitFor({ state: "detached", timeout: 20_000 });

  console.log("E2E teams flow test passed");
} finally {
  await browser.close();
}

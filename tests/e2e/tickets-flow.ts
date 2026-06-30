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

const email = `e2e-tickets+${Date.now()}@example.com`;
const password = "supersecret123";
const teamName = `TicketTeam-${Date.now()}`;
const epicTitle = `TicketEpic-${Date.now()}`;
const ticketTitle = `Ticket-${Date.now()}`;
const renamedTicket = `${ticketTitle}-renamed`;

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();

  // Sign up, verify, and log in.
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

  // A ticket needs a team; create one (and an epic to exercise association).
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("heading", { name: "Teams", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByPlaceholder("New team name").fill(teamName);
  await page.getByRole("button", { name: "Create team" }).click();
  await page.getByText(teamName, { exact: true }).waitFor({ timeout: 20_000 });

  await page.getByRole("button", { name: "Epics", exact: true }).click();
  await page.getByRole("heading", { name: "Epics", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByLabel("Team", { exact: true }).selectOption({ label: teamName });
  await page.getByPlaceholder("Epic title").fill(epicTitle);
  await page.getByRole("button", { name: "Create epic" }).click();
  await page.getByText(epicTitle, { exact: true }).waitFor({ timeout: 20_000 });

  // Create a ticket for the team + epic.
  await page.getByRole("button", { name: "Tickets", exact: true }).click();
  await page.getByRole("heading", { name: "Tickets", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByRole("heading", { name: "New ticket", exact: true }).waitFor({ timeout: 20_000 });

  await page.getByLabel("Team", { exact: true }).selectOption({ label: teamName });
  await page.getByLabel("Type", { exact: true }).selectOption("bug");
  await page.getByLabel("Epic", { exact: true }).selectOption({ label: epicTitle });
  await page.getByPlaceholder("Ticket title").fill(ticketTitle);
  await page.getByPlaceholder("Describe the work").fill("Body of the ticket.");
  await page.getByRole("button", { name: "Create ticket" }).click();

  // Lands on the details screen with the ticket title as the heading.
  await page.getByRole("heading", { name: ticketTitle, exact: true }).waitFor({ timeout: 20_000 });

  // Change state immediately, then reload to confirm it persisted.
  await page.getByLabel("State", { exact: true }).selectOption("in_progress");
  await sleep(500);
  await page.reload();
  await page.getByRole("heading", { name: ticketTitle, exact: true }).waitFor({ timeout: 20_000 });
  const persistedState = await page.getByLabel("State", { exact: true }).inputValue();
  if (persistedState !== "in_progress") {
    throw new Error(`State did not persist; expected in_progress, got ${persistedState}`);
  }

  // Edit the title and save.
  await page.getByLabel("Title", { exact: true }).fill(renamedTicket);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("heading", { name: renamedTicket, exact: true }).waitFor({ timeout: 20_000 });

  // Delete with confirmation; we should return to the list without this ticket.
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("heading", { name: "Tickets", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByText(renamedTicket, { exact: true }).waitFor({ state: "detached", timeout: 20_000 });

  console.log("E2E tickets flow test passed");
} finally {
  await browser.close();
}

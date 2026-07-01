import { chromium, type Locator, type Page } from "playwright";

// Definition-of-Done happy path (spec §13): one end-to-end journey that signs up,
// verifies via Mailpit, logs in, creates a team, an epic, and a ticket, adds a
// comment, then drags the ticket to Done on the board and confirms the change
// persists across a refresh. This is the executable proof of the functional DoD.

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
      if (response.ok) return;
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
        if (match && match[1]) return match[1];
      }
    }
    await sleep(1_000);
  }
  throw new Error(`No verification email found for ${email}`);
}

// Drag a card onto a column using real mouse events, with enough intermediate
// moves to exceed dnd-kit's activation distance and register the target column.
async function dragCardToColumn(page: Page, card: Locator, column: Locator): Promise<void> {
  const cardBox = await card.boundingBox();
  const columnBox = await column.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Could not resolve bounding boxes for the drag");
  }
  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const endX = columnBox.x + columnBox.width / 2;
  const endY = columnBox.y + 80;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY + 12, { steps: 6 });
  await page.mouse.move(endX, endY, { steps: 14 });
  await page.mouse.move(endX, endY, { steps: 3 });
  await page.mouse.up();
}

await waitForHttp(appUrl, "Frontend");
await waitForHttp(`${mailpitUrl}/api/v1/messages`, "Mailpit");

const email = `e2e-dod+${Date.now()}@example.com`;
const password = "supersecret123";
const teamName = `DoDTeam-${Date.now()}`;
const epicTitle = `DoDEpic-${Date.now()}`;
const ticketTitle = `DoDTicket-${Date.now()}`;
const commentBody = `DoD comment ${Date.now()}`;

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1700, height: 1000 });

  // 1. Sign up, receive the verification email, verify, and log in.
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

  // 2. Create a team.
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("heading", { name: "Teams", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByPlaceholder("New team name").fill(teamName);
  await page.getByRole("button", { name: "Create team" }).click();
  await page.getByText(teamName, { exact: true }).waitFor({ timeout: 20_000 });

  // 3. Create an epic for that team.
  await page.getByRole("button", { name: "Epics", exact: true }).click();
  await page.getByRole("heading", { name: "Epics", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByLabel("Team", { exact: true }).selectOption({ label: teamName });
  await page.getByPlaceholder("Epic title").fill(epicTitle);
  await page.getByRole("button", { name: "Create epic" }).click();
  await page.getByText(epicTitle, { exact: true }).waitFor({ timeout: 20_000 });

  // 4. Create a ticket for the team + epic.
  await page.getByRole("button", { name: "Tickets", exact: true }).click();
  await page.getByRole("heading", { name: "Tickets", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByRole("heading", { name: "New ticket", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByLabel("Team", { exact: true }).selectOption({ label: teamName });
  await page.getByLabel("Type", { exact: true }).selectOption("feature");
  await page.getByLabel("Epic", { exact: true }).selectOption({ label: epicTitle });
  await page.getByPlaceholder("Ticket title").fill(ticketTitle);
  await page.getByPlaceholder("Describe the work").fill("Body of the DoD ticket.");
  await page.getByRole("button", { name: "Create ticket" }).click();
  await page.getByRole("heading", { name: ticketTitle, exact: true }).waitFor({ timeout: 20_000 });

  // 5. Add a comment and confirm it shows with the author's email.
  await page.getByLabel("Add comment", { exact: true }).fill(commentBody);
  await page.getByRole("button", { name: "Post comment" }).click();
  await page.getByText(commentBody, { exact: true }).waitFor({ timeout: 20_000 });
  await page.getByText(email, { exact: true }).first().waitFor({ timeout: 20_000 });

  // 6. Open the board, select the team, and confirm the ticket is in New.
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("heading", { name: "Kanban board" }).waitFor({ timeout: 20_000 });
  await page.getByLabel("Board team", { exact: true }).selectOption({ label: teamName });
  const newColumn = page.locator("[data-column='new']");
  const doneColumn = page.locator("[data-column='done']");
  await newColumn.getByText(ticketTitle, { exact: true }).waitFor({ timeout: 20_000 });

  // 7. Drag the ticket directly from New to Done; it should move there.
  await dragCardToColumn(page, page.locator("[data-ticket-id]", { hasText: ticketTitle }), doneColumn);
  await doneColumn.getByText(ticketTitle, { exact: true }).waitFor({ timeout: 20_000 });

  // 8. Reload and confirm the state change persisted (drag updated the server).
  await page.reload();
  await page.getByLabel("Board team", { exact: true }).selectOption({ label: teamName });
  await doneColumn.getByText(ticketTitle, { exact: true }).waitFor({ timeout: 20_000 });

  console.log("E2E definition-of-done flow test passed");
} finally {
  await browser.close();
}

import { chromium, type Locator, type Page } from "playwright";

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

// Drag a card onto a column using real mouse events, with enough intermediate
// moves to (a) exceed dnd-kit's activation distance and (b) let its collision
// detection register the target column under the pointer.
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

const email = `e2e-board+${Date.now()}@example.com`;
const password = "supersecret123";
const teamName = `BoardTeam-${Date.now()}`;
const bugTitle = `BoardBug-${Date.now()}`;
const featureTitle = `BoardFeature-${Date.now()}`;

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  // A wide viewport so all five columns are visible without horizontal scroll,
  // which keeps the drag target on-screen.
  await page.setViewportSize({ width: 1700, height: 1000 });

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

  // Create a team for the board.
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("heading", { name: "Teams", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByPlaceholder("New team name").fill(teamName);
  await page.getByRole("button", { name: "Create team" }).click();
  await page.getByText(teamName, { exact: true }).waitFor({ timeout: 20_000 });

  // Create two tickets (a bug and a feature) for the team; both start in "new".
  for (const [title, type] of [
    [bugTitle, "bug"],
    [featureTitle, "feature"],
  ] as const) {
    await page.getByRole("button", { name: "Tickets", exact: true }).click();
    await page.getByRole("heading", { name: "Tickets", exact: true }).waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "New ticket" }).click();
    await page.getByRole("heading", { name: "New ticket", exact: true }).waitFor({ timeout: 20_000 });
    await page.getByLabel("Team", { exact: true }).selectOption({ label: teamName });
    await page.getByLabel("Type", { exact: true }).selectOption(type);
    await page.getByPlaceholder("Ticket title").fill(title);
    await page.getByPlaceholder("Describe the work").fill(`Body for ${title}.`);
    await page.getByRole("button", { name: "Create ticket" }).click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor({ timeout: 20_000 });
  }

  // Go to the board and select the team.
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("heading", { name: "Kanban board" }).waitFor({ timeout: 20_000 });
  await page.getByLabel("Board team", { exact: true }).selectOption({ label: teamName });

  // Five columns are present in workflow order.
  const columnLabels = ["New", "Ready for implementation", "In progress", "Ready for acceptance", "Done"];
  for (const label of columnLabels) {
    await page.getByRole("heading", { name: label, exact: true }).waitFor({ timeout: 20_000 });
  }

  // Both cards start in the New column.
  const newColumn = page.locator("[data-column='new']");
  const inProgressColumn = page.locator("[data-column='in_progress']");
  const doneColumn = page.locator("[data-column='done']");
  await newColumn.getByText(bugTitle, { exact: true }).waitFor({ timeout: 20_000 });
  await newColumn.getByText(featureTitle, { exact: true }).waitFor({ timeout: 20_000 });

  // Drag the bug card from New to In progress; it should move there.
  await dragCardToColumn(page, page.locator("[data-ticket-id]", { hasText: bugTitle }), inProgressColumn);
  await inProgressColumn.getByText(bugTitle, { exact: true }).waitFor({ timeout: 20_000 });
  await newColumn
    .getByText(bugTitle, { exact: true })
    .waitFor({ state: "detached", timeout: 20_000 });

  // Persistence: reload and confirm the bug is still in In progress.
  await page.reload();
  await page.getByLabel("Board team", { exact: true }).selectOption({ label: teamName });
  await inProgressColumn.getByText(bugTitle, { exact: true }).waitFor({ timeout: 20_000 });

  // Filter by type = Feature: only the feature card remains.
  await page.getByLabel("Filter by type", { exact: true }).selectOption("feature");
  await page.getByText(featureTitle, { exact: true }).waitFor({ timeout: 20_000 });
  await page
    .getByText(bugTitle, { exact: true })
    .waitFor({ state: "detached", timeout: 20_000 });

  // Clear restores the full board (the bug card returns).
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByText(bugTitle, { exact: true }).waitFor({ timeout: 20_000 });

  // Title search narrows to the feature card.
  await page.getByLabel("Search by title", { exact: true }).fill(featureTitle);
  await page.getByText(featureTitle, { exact: true }).waitFor({ timeout: 20_000 });
  await page
    .getByText(bugTitle, { exact: true })
    .waitFor({ state: "detached", timeout: 20_000 });
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByText(bugTitle, { exact: true }).waitFor({ timeout: 20_000 });

  // Drag-failure rollback: force the state-change request to fail, then drag the
  // feature card; it must return to its original column and show an error.
  await page.route(/\/api\/tickets\/[^/]+\/state/, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "server_error", message: "Forced failure" } }),
    }),
  );

  await dragCardToColumn(page, page.locator("[data-ticket-id]", { hasText: featureTitle }), doneColumn);
  await page.getByRole("alert").waitFor({ timeout: 20_000 });
  // The card is back in New (it never reached Done).
  await newColumn.getByText(featureTitle, { exact: true }).waitFor({ timeout: 20_000 });
  await doneColumn
    .getByText(featureTitle, { exact: true })
    .waitFor({ state: "detached", timeout: 20_000 });

  await page.unroute(/\/api\/tickets\/[^/]+\/state/);

  console.log("E2E board flow test passed");
} finally {
  await browser.close();
}

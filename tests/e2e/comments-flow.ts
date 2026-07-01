import { chromium, type Page } from "playwright";

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

// After a successful post the form clears asynchronously (post → clear → refetch).
// Wait for that clear to land before typing the next comment, so the fill can't
// race with — and be clobbered by — the reset.
async function waitForCommentBoxEmpty(page: Page): Promise<void> {
  const box = page.locator("#new-comment");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await box.inputValue()) === "") return;
    await sleep(100);
  }
  throw new Error("Comment box did not clear after posting");
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

const email = `e2e-comments+${Date.now()}@example.com`;
const password = "supersecret123";
const teamName = `CommentTeam-${Date.now()}`;
const ticketTitle = `CommentTicket-${Date.now()}`;
const firstComment = `First comment ${Date.now()}`;
const secondComment = `Second comment ${Date.now()}`;

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

  // A comment needs a ticket, which needs a team. Create the team first.
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("heading", { name: "Teams", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByPlaceholder("New team name").fill(teamName);
  await page.getByRole("button", { name: "Create team" }).click();
  await page.getByText(teamName, { exact: true }).waitFor({ timeout: 20_000 });

  // Create a ticket for the team.
  await page.getByRole("button", { name: "Tickets", exact: true }).click();
  await page.getByRole("heading", { name: "Tickets", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "New ticket" }).click();
  await page.getByRole("heading", { name: "New ticket", exact: true }).waitFor({ timeout: 20_000 });

  await page.getByLabel("Team", { exact: true }).selectOption({ label: teamName });
  await page.getByLabel("Type", { exact: true }).selectOption("bug");
  await page.getByPlaceholder("Ticket title").fill(ticketTitle);
  await page.getByPlaceholder("Describe the work").fill("Body of the ticket.");
  await page.getByRole("button", { name: "Create ticket" }).click();

  // Lands on the details screen with the ticket title as the heading.
  await page.getByRole("heading", { name: ticketTitle, exact: true }).waitFor({ timeout: 20_000 });

  // Empty list state first.
  await page.getByText(/no comments yet/i).waitFor({ timeout: 20_000 });

  // Record the ticket's "Last modified" so we can confirm commenting doesn't bump it.
  const modifiedLocator = page
    .locator("dt", { hasText: "Last modified" })
    .locator("xpath=following-sibling::dd[1]");
  const modifiedBefore = (await modifiedLocator.textContent())?.trim() ?? "";

  // Add the first comment.
  await page.getByLabel("Add comment", { exact: true }).fill(firstComment);
  await page.getByRole("button", { name: "Post comment" }).click();
  await page.getByText(firstComment, { exact: true }).waitFor({ timeout: 20_000 });

  // Add the second comment (only once the form has cleared from the first post).
  await waitForCommentBoxEmpty(page);
  await page.getByLabel("Add comment", { exact: true }).fill(secondComment);
  await page.getByRole("button", { name: "Post comment" }).click();
  await page.getByText(secondComment, { exact: true }).waitFor({ timeout: 20_000 });

  // Both comments show the author's email.
  await page.getByText(email, { exact: true }).first().waitFor({ timeout: 20_000 });

  // Oldest-first order: the first comment must appear before the second in the DOM.
  // Wait for the second comment item to be present before snapshotting — posting
  // triggers a refetch that briefly unmounts the list, and allTextContents() does
  // not auto-wait, so an early snapshot could catch the empty loading window.
  const commentBodies = page.locator("section[aria-label='Comments'] li p");
  await commentBodies.nth(1).waitFor({ timeout: 20_000 });
  const bodies = await commentBodies.allTextContents();
  const firstIndex = bodies.indexOf(firstComment);
  const secondIndex = bodies.indexOf(secondComment);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex > secondIndex) {
    throw new Error(
      `Comments not in oldest-first order: ${JSON.stringify(bodies)}`,
    );
  }

  // Commenting must not change the ticket's modified timestamp.
  const modifiedAfter = (await modifiedLocator.textContent())?.trim() ?? "";
  if (modifiedBefore !== modifiedAfter) {
    throw new Error(
      `Ticket modified timestamp changed after commenting: "${modifiedBefore}" -> "${modifiedAfter}"`,
    );
  }

  // Comments survive a refresh, still oldest-first.
  await page.reload();
  await page.getByText(firstComment, { exact: true }).waitFor({ timeout: 20_000 });
  await page.getByText(secondComment, { exact: true }).waitFor({ timeout: 20_000 });
  const reloadedBodyLocator = page.locator("section[aria-label='Comments'] li p");
  await reloadedBodyLocator.nth(1).waitFor({ timeout: 20_000 });
  const reloadedBodies = await reloadedBodyLocator.allTextContents();
  if (reloadedBodies.indexOf(firstComment) > reloadedBodies.indexOf(secondComment)) {
    throw new Error(`Comments not in oldest-first order after refresh: ${JSON.stringify(reloadedBodies)}`);
  }

  console.log("E2E comments flow test passed");
} finally {
  await browser.close();
}

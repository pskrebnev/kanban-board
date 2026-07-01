// Deterministic generator for a richer QA/demo dataset.
//
// The app's domain model is Team -> Epic -> Ticket; there is no "project" entity.
// A "project" is therefore represented as a namespaced group of epics under its
// team: each epic's title is "<Project> — <Epic>", and tasks are tickets that
// reference those epics. This preserves a Team -> Project -> Epic -> Task
// structure within the existing schema and imports through the normal seed path.
//
// Output matches backend/src/seed.ts's datasetSchema, so it can be loaded with:
//   SEED_FILE_HOST=./backend/seed/generated-data.json \
//     docker compose -f compose.yaml -f compose.seed.yaml up --build
//
// The generator is deterministic (no randomness), so re-running it produces an
// identical file. Regenerate with:  node backend/seed/generate.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const USERS = [
  { email: "demo@mailpit.pit", password: "password123", emailVerified: true },
  { email: "pm@mailpit.pit", password: "password123", emailVerified: true },
  { email: "dev@mailpit.pit", password: "password123", emailVerified: true },
];

// Each project belongs to one team and contributes 5 epics.
const PROJECTS = [
  {
    team: "Orion",
    project: "Banking App",
    theme: "building a retail banking application",
    epics: [
      "Account Onboarding",
      "Payments & Transfers",
      "Card Management",
      "Security & Fraud Detection",
      "Statements & Reporting",
    ],
  },
  {
    team: "Orion",
    project: "MigrationToKafka",
    theme: "migrating messaging from RabbitMQ to Kafka",
    epics: [
      "Kafka Cluster Provisioning",
      "Producer Migration",
      "Consumer Migration",
      "Schema Registry & Contracts",
      "RabbitMQ Decommission",
    ],
  },
  {
    team: "MobileWolf",
    project: "DocuUp",
    theme: "an app for working with scanned documents",
    epics: [
      "Document Ingestion",
      "OCR Pipeline",
      "Full-Text Search",
      "Annotations & Markup",
      "Export & Sharing",
    ],
  },
  {
    team: "Juniper",
    project: "MediaShop",
    theme: "selling house equipment (TVs, fridges, vacuum cleaners, ...)",
    epics: [
      "Product Catalog",
      "Cart & Checkout",
      "Payment Integration",
      "Order Fulfillment",
      "Reviews & Ratings",
    ],
  },
  {
    team: "Juniper",
    project: "ArtistsInWeb",
    theme: "a website for artists",
    epics: [
      "Artist Profiles",
      "Portfolio Galleries",
      "Commission Requests",
      "Blog & News",
      "Community Feed",
    ],
  },
];

// Task templates (a realistic mix of develop/test/investigate/etc.). Each epic
// takes the first 5-8 of these. `label` builds the ticket title around the epic;
// `detail` is a concise 5-9 word body describing the task.
const TASK_TEMPLATES = [
  { label: (e) => `Investigate ${e} requirements`, detail: (e) => `Clarify ${e} scope and requirements`, type: "feature", state: "new" },
  { label: (e) => `Design ${e} solution`, detail: (e) => `Design ${e} architecture and interfaces`, type: "feature", state: "ready_for_implementation" },
  { label: (e) => `Develop ${e} backend`, detail: (e) => `Implement ${e} services and APIs`, type: "feature", state: "in_progress" },
  { label: (e) => `Develop ${e} frontend`, detail: (e) => `Build ${e} screens and interactions`, type: "feature", state: "in_progress" },
  { label: (e) => `Write automated tests for ${e}`, detail: (e) => `Cover ${e} with automated tests`, type: "feature", state: "ready_for_acceptance" },
  { label: (e) => `Fix defects in ${e}`, detail: (e) => `Resolve ${e} defects from QA`, type: "bug", state: "in_progress" },
  { label: (e) => `Document ${e}`, detail: (e) => `Document ${e} for users and developers`, type: "feature", state: "done" },
  { label: (e) => `Refactor ${e} for performance`, detail: (e) => `Refactor ${e} for better performance`, type: "fix", state: "ready_for_acceptance" },
];

const teams = [...new Set(PROJECTS.map((p) => p.team))].map((name) => ({ name }));

const epics = [];
const tickets = [];
let epicIndex = 0;

for (const { team, project, theme, epics: epicNames } of PROJECTS) {
  epicNames.forEach((epicName) => {
    const title = `${project} — ${epicName}`;
    epics.push({
      team,
      title,
      description: `${epicName} for the ${project} project (${theme}).`,
    });

    // 5-8 tasks per epic, cycling deterministically.
    const taskCount = 5 + (epicIndex % 4);
    for (let i = 0; i < taskCount; i += 1) {
      const template = TASK_TEMPLATES[i];
      tickets.push({
        team,
        epic: title,
        type: template.type,
        state: template.state,
        title: template.label(epicName),
        body: template.detail(epicName),
        createdBy: USERS[(epicIndex + i) % USERS.length].email,
      });
    }
    epicIndex += 1;
  });
}

const dataset = { users: USERS, teams, epics, tickets, comments: [] };

const outPath = resolve(here, "generated-data.json");
writeFileSync(outPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

console.log(
  `[generate] Wrote ${outPath}: ${teams.length} teams, ${PROJECTS.length} projects, ` +
    `${epics.length} epics, ${tickets.length} tickets, ${USERS.length} users.`,
);

// Cross-platform launcher behind the root npm scripts, so the short commands
// run directly from any shell (PowerShell, bash, …) without `make`:
//
//   npm run up        # clean start, no data
//   npm run seed      # start with the generated demo dataset (ephemeral)
//   npm run verify    # start seeded + run the full e2e suite
//   npm run down      # stop and remove volumes
//
// It auto-detects the container engine (Docker if present, else podman-compose)
// and runs a fixed compose "kanban" project so the commands are deterministic.
// Override the engine with COMPOSE, e.g. COMPOSE="podman-compose".

import { spawnSync } from "node:child_process";

const GENERATED = "./backend/seed/generated-data.json";

function resolveCompose() {
  if (process.env.COMPOSE) return process.env.COMPOSE.split(" ");
  const docker = spawnSync("docker", ["compose", "version"], { stdio: "ignore", shell: true });
  return docker.status === 0 ? ["docker", "compose"] : ["podman-compose"];
}

const [bin, ...leadArgs] = resolveCompose();
const isDocker = bin === "docker";
const project = ["-p", "kanban"];
const base = ["-f", "compose.yaml"];
const seedFiles = [...base, "-f", "compose.seed.yaml"];

// `--exit-code-from` (so `verify` fails on a failed test) is a docker-compose
// feature; podman-compose only supports `--abort-on-container-exit`.
const verifyExit = isDocker ? ["--exit-code-from", "e2e"] : [];

const MODES = {
  up: { files: base, args: ["up", "--build"] },
  seed: { files: seedFiles, args: ["up", "--build"], env: { SEED_FILE_HOST: GENERATED } },
  verify: {
    files: [...seedFiles, "--profile", "test"],
    args: ["up", "--build", "--abort-on-container-exit", ...verifyExit, "e2e"],
    env: { SEED_FILE_HOST: GENERATED },
  },
  down: { files: base, args: ["down", "-v"] },
};

const mode = process.argv[2];
const cfg = MODES[mode];
if (!cfg) {
  console.error(`Usage: node scripts/run.mjs <up|seed|verify|down>`);
  process.exit(1);
}

const argv = [...leadArgs, ...project, ...cfg.files, ...cfg.args];
console.log(`> ${bin} ${argv.join(" ")}`);
const result = spawnSync(bin, argv, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...(cfg.env ?? {}) },
});
process.exit(result.status ?? 1);

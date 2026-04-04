/**
 * Eenmalig: maakt label `auto-agent` op GitHub aan (zelfde repo als de Discord-bot).
 * Run: npx tsx scripts/ensure-auto-agent-label.ts
 */
import "dotenv/config";
import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

const token = process.env.GITHUB_TOKEN?.trim();
const owner = process.env.GITHUB_REPO_OWNER?.trim();
const repo = process.env.GITHUB_REPO_NAME?.trim();

if (!token || !owner || !repo) {
  console.error("Zet GITHUB_TOKEN, GITHUB_REPO_OWNER en GITHUB_REPO_NAME in discord-bot/.env");
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

try {
  await octokit.rest.issues.createLabel({
    owner,
    repo,
    name: "auto-agent",
    color: "0E8A16",
    description: "Discord /bug of /idee — triage voor Cursor background agent workflow",
  });
  console.log(`Label auto-agent aangemaakt op ${owner}/${repo}`);
} catch (err) {
  if (err instanceof RequestError && err.status === 422) {
    console.log("Label auto-agent bestaat waarschijnlijk al (422). Geen actie nodig.");
    process.exit(0);
  }
  throw err;
}

import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

/** Zet deze label eenmalig aan in GitHub (Issues → Labels) zodat de workflow kan triggeren. */
const LABEL_AUTO = "auto-agent";

export type IssueKind = "bug" | "feature";

export async function createTrackedIssue(input: {
  kind: IssueKind;
  title: string;
  body: string;
  reporterTag: string;
  reporterId: string;
}): Promise<{ htmlUrl: string; number: number } | null> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;

  if (!token || !owner || !repo) {
    return null;
  }

  const octokit = new Octokit({ auth: token });
  const prefix = input.kind === "bug" ? "[BUG]" : "[FEATURE]";
  const safeTitle = `${prefix} ${input.title}`.slice(0, 200);

  const fullBody = [
    input.body.trim(),
    "",
    "---",
    `**Discord:** ${input.reporterTag} (\`${input.reporterId}\`)`,
    `**Type:** ${input.kind === "bug" ? "Bug" : "Feature / idee"}`,
  ].join("\n");

  try {
    const { data } = await octokit.rest.issues.create({
      owner,
      repo,
      title: safeTitle,
      body: fullBody.slice(0, 65000),
      labels: [LABEL_AUTO],
    });
    return { htmlUrl: data.html_url, number: data.number };
  } catch (err) {
    if (err instanceof RequestError && err.status === 422) {
      const { data } = await octokit.rest.issues.create({
        owner,
        repo,
        title: safeTitle,
        body:
          fullBody.slice(0, 65000) +
          "\n\n_(GitHub-label `auto-agent` bestaat nog niet — maak die aan voor de auto-workflow.)_",
      });
      return { htmlUrl: data.html_url, number: data.number };
    }
    throw err;
  }
}

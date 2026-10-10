import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import { env, githubConfigured } from "../env.ts";

const API = "https://api.github.com";
const OAUTH = "https://github.com";
const API_VERSION = "2022-11-28";
const TIMEOUT_MS = 12_000;

export class GitHubError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export type GitHubUser = { id: bigint; login: string };
export type GitHubInstallationInfo = {
  id: bigint;
  accountId: bigint;
  accountLogin: string;
  accountType: "User" | "Organization";
};
export type GitHubRepositoryInfo = {
  id: bigint;
  ownerLogin: string;
  name: string;
  fullName: string;
  private: boolean;
};
export type GitHubIssueInfo = {
  id: bigint;
  number: number;
  htmlUrl: string;
  body: string;
  state: "open" | "closed";
  updatedAt: Date;
};
export type GitHubPullRequestInfo = {
  id: bigint;
  number: number;
  state: "open" | "closed";
  updatedAt: Date;
  branch: string;
  issueNumbers: number[];
};

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function classify(status: number): string {
  if (status === 401 || status === 403) return "github_access_denied";
  if (status === 404) return "github_repository_unavailable";
  if (status === 429) return "github_rate_limited";
  if (status >= 500) return "github_unavailable";
  return "github_publish_failed";
}

async function githubFetch(
  url: string,
  init: RequestInit & { token?: string; appJwt?: string } = {}
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "Mokara-GitHub-Integration",
        "x-github-api-version": API_VERSION,
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.appJwt ? { authorization: `Bearer ${init.appJwt}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw new GitHubError(res.status, "github_unavailable", "GitHub returned invalid JSON");
      }
    }
    if (!res.ok) {
      const message = string(object(body)?.message) ?? `GitHub answered ${res.status}`;
      const rateLimited = res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0";
      throw new GitHubError(
        res.status,
        rateLimited ? "github_rate_limited" : classify(res.status),
        message
      );
    }
    return body;
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    throw new GitHubError(0, "github_unavailable", "GitHub could not be reached");
  } finally {
    clearTimeout(timer);
  }
}

function configured(): void {
  if (!githubConfigured) {
    throw new GitHubError(503, "github_not_configured", "GitHub integration is not configured");
  }
}

export function githubAuthorizeUrl(state: string): string {
  configured();
  const url = new URL("/login/oauth/authorize", OAUTH);
  url.searchParams.set("client_id", env.GITHUB_APP_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GITHUB_CALLBACK_URL);
  url.searchParams.set("state", state);
  return url.toString();
}

export function githubInstallUrl(state: string): string {
  configured();
  const url = new URL(`/apps/${encodeURIComponent(env.GITHUB_APP_SLUG)}/installations/new`, OAUTH);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGitHubCode(code: string): Promise<string> {
  configured();
  const body = await githubFetch(`${OAUTH}/login/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_APP_CLIENT_ID,
      client_secret: env.GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_CALLBACK_URL,
    }),
  });
  const token = string(object(body)?.access_token);
  if (!token) throw new GitHubError(502, "github_unavailable", "GitHub omitted the access token");
  return token;
}

export async function revokeGitHubUserToken(token: string): Promise<void> {
  configured();
  const basic = Buffer.from(
    `${env.GITHUB_APP_CLIENT_ID}:${env.GITHUB_APP_CLIENT_SECRET}`,
    "utf8"
  ).toString("base64");
  await githubFetch(`${API}/applications/${encodeURIComponent(env.GITHUB_APP_CLIENT_ID)}/token`, {
    method: "DELETE",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/json" },
    body: JSON.stringify({ access_token: token }),
  });
}

export async function getGitHubUser(token: string): Promise<GitHubUser> {
  const row = object(await githubFetch(`${API}/user`, { token }));
  const id = integer(row?.id);
  const login = string(row?.login);
  if (id === null || !login) {
    throw new GitHubError(502, "github_unavailable", "GitHub returned an invalid user");
  }
  return { id: BigInt(id), login };
}

export async function listUserInstallations(token: string): Promise<GitHubInstallationInfo[]> {
  const all: GitHubInstallationInfo[] = [];
  for (let page = 1; ; page++) {
    const payload = object(
      await githubFetch(`${API}/user/installations?per_page=100&page=${page}`, { token })
    );
    const rows = payload?.installations;
    if (!Array.isArray(rows)) {
      throw new GitHubError(502, "github_unavailable", "GitHub returned invalid installations");
    }
    all.push(
      ...rows.map((value): GitHubInstallationInfo => {
        const row = object(value);
        const account = object(row?.account);
        const id = integer(row?.id);
        const accountId = integer(account?.id);
        const accountLogin = string(account?.login);
        const rawType = string(account?.type);
        const accountType = rawType === "Organization" ? "Organization" : "User";
        if (id === null || accountId === null || !accountLogin) {
          throw new GitHubError(
            502,
            "github_unavailable",
            "GitHub returned an invalid installation"
          );
        }
        return { id: BigInt(id), accountId: BigInt(accountId), accountLogin, accountType };
      })
    );
    if (rows.length < 100) return all;
  }
}

async function appJwt(): Promise<string> {
  configured();
  const pem = Buffer.from(env.GITHUB_APP_PRIVATE_KEY_BASE64, "base64").toString("utf8");
  // GitHub-generated App keys are commonly PKCS#1 (`BEGIN RSA PRIVATE
  // KEY`), while operator-converted keys may be PKCS#8. Node's parser accepts
  // both; jose's importPKCS8 helper deliberately accepts only the latter.
  const key = createPrivateKey(pem);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(env.GITHUB_APP_ID)
    .sign(key);
}

export async function installationToken(
  installationId: bigint,
  repositoryId?: bigint
): Promise<string> {
  const payload = object(
    await githubFetch(`${API}/app/installations/${installationId.toString()}/access_tokens`, {
      method: "POST",
      appJwt: await appJwt(),
      ...(repositoryId
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ repository_ids: [Number(repositoryId)] }),
          }
        : {}),
    })
  );
  const token = string(payload?.token);
  if (!token) {
    throw new GitHubError(502, "github_unavailable", "GitHub omitted the installation token");
  }
  return token;
}

function repositoriesFrom(payload: JsonObject | null): GitHubRepositoryInfo[] {
  const rows = payload?.repositories;
  if (!Array.isArray(rows)) {
    throw new GitHubError(502, "github_unavailable", "GitHub returned invalid repositories");
  }
  return rows.map((value) => {
    const row = object(value);
    const owner = object(row?.owner);
    const id = integer(row?.id);
    const ownerLogin = string(owner?.login);
    const name = string(row?.name);
    const fullName = string(row?.full_name);
    if (id === null || !ownerLogin || !name || !fullName) {
      throw new GitHubError(502, "github_unavailable", "GitHub returned an invalid repository");
    }
    return { id: BigInt(id), ownerLogin, name, fullName, private: row?.private === true };
  });
}

export async function listUserInstallationRepositories(
  token: string,
  installationId: bigint
): Promise<GitHubRepositoryInfo[]> {
  const all: GitHubRepositoryInfo[] = [];
  for (let page = 1; ; page++) {
    const payload = object(
      await githubFetch(
        `${API}/user/installations/${installationId.toString()}/repositories?per_page=100&page=${page}`,
        { token }
      )
    );
    const rows = repositoriesFrom(payload);
    all.push(...rows);
    if (rows.length < 100) return all;
  }
}

export async function listInstallationRepositories(
  installationId: bigint
): Promise<GitHubRepositoryInfo[]> {
  const token = await installationToken(installationId);
  const all: GitHubRepositoryInfo[] = [];
  for (let page = 1; ; page++) {
    const rows = repositoriesFrom(
      object(
        await githubFetch(`${API}/installation/repositories?per_page=100&page=${page}`, { token })
      )
    );
    all.push(...rows);
    if (rows.length < 100) return all;
  }
}

function issue(value: unknown): GitHubIssueInfo | null {
  const row = object(value);
  const id = integer(row?.id);
  const number = integer(row?.number);
  const htmlUrl = string(row?.html_url);
  const body = string(row?.body) ?? "";
  const state = string(row?.state);
  const updatedAt = new Date(string(row?.updated_at) ?? "");
  if (
    id === null ||
    number === null ||
    !htmlUrl ||
    (state !== "open" && state !== "closed") ||
    !Number.isFinite(updatedAt.getTime())
  )
    return null;
  const url = new URL(htmlUrl);
  if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
  return { id: BigInt(id), number, htmlUrl: url.toString(), body, state, updatedAt };
}

export async function findIssueByMarker(
  installationId: bigint,
  owner: string,
  repository: string,
  marker: string
): Promise<GitHubIssueInfo | null> {
  const token = await installationToken(installationId);
  const url = new URL(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`
  );
  url.searchParams.set("state", "all");
  url.searchParams.set("sort", "created");
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", "100");
  const rows = await githubFetch(url.toString(), { token });
  if (!Array.isArray(rows)) return null;
  for (const value of rows) {
    const found = issue(value);
    if (found?.body.includes(marker)) return found;
  }
  return null;
}

export async function createGitHubIssue(
  installationId: bigint,
  owner: string,
  repository: string,
  title: string,
  body: string
): Promise<GitHubIssueInfo> {
  const token = await installationToken(installationId);
  const payload = await githubFetch(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`,
    {
      method: "POST",
      token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body }),
    }
  );
  const created = issue(payload);
  if (!created) {
    throw new GitHubError(502, "github_unavailable", "GitHub returned an invalid issue");
  }
  return created;
}

export type GitHubCoordinates = {
  installationId: bigint;
  repositoryId: bigint;
  owner: string;
  name: string;
};

function repositoryUrl(repository: GitHubCoordinates): string {
  return `${API}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
}

export async function getGitHubIssue(
  repository: GitHubCoordinates,
  number: number
): Promise<GitHubIssueInfo> {
  const token = await installationToken(repository.installationId, repository.repositoryId);
  const found = issue(
    await githubFetch(`${repositoryUrl(repository)}/issues/${number}`, { token })
  );
  if (!found) throw new GitHubError(502, "github_unavailable", "GitHub returned an invalid issue");
  return found;
}

export async function setGitHubIssueState(
  repository: GitHubCoordinates,
  number: number,
  state: "open" | "closed"
): Promise<GitHubIssueInfo> {
  const token = await installationToken(repository.installationId, repository.repositoryId);
  const updated = issue(
    await githubFetch(`${repositoryUrl(repository)}/issues/${number}`, {
      method: "PATCH",
      token,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state, ...(state === "closed" ? { state_reason: "completed" } : {}) }),
    })
  );
  if (!updated)
    throw new GitHubError(502, "github_unavailable", "GitHub returned an invalid issue");
  return updated;
}

export async function githubBranchExists(
  repository: GitHubCoordinates,
  ref: string
): Promise<boolean> {
  const token = await installationToken(repository.installationId, repository.repositoryId);
  try {
    await githubFetch(
      `${repositoryUrl(repository)}/git/ref/heads/${ref.split("/").map(encodeURIComponent).join("/")}`,
      { token }
    );
    return true;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return false;
    throw error;
  }
}

// GitHub's explicit PR/issue links, not an arbitrary number mentioned in text.
// Repository-scoped tokens deliberately exclude cross-repository links.
export async function getGitHubPullRequest(
  repository: GitHubCoordinates,
  number: number
): Promise<GitHubPullRequestInfo> {
  const token = await installationToken(repository.installationId, repository.repositoryId);
  const row = object(await githubFetch(`${repositoryUrl(repository)}/pulls/${number}`, { token }));
  const id = integer(row?.id);
  const state = string(row?.state);
  const updatedAt = new Date(string(row?.updated_at) ?? "");
  const head = object(row?.head);
  const branch = string(head?.ref);
  if (
    id === null ||
    (state !== "open" && state !== "closed") ||
    !branch ||
    !Number.isFinite(updatedAt.getTime())
  ) {
    throw new GitHubError(502, "github_unavailable", "GitHub returned an invalid pull request");
  }
  const issueNumbers: number[] = [];
  let cursor: string | null = null;
  do {
    const result = object(
      await githubFetch(`${API}/graphql`, {
        method: "POST",
        token,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
          repository(owner: $owner, name: $name) { pullRequest(number: $number) {
            closingIssuesReferences(first: 100, after: $cursor) {
              nodes { number repository { databaseId } }
              pageInfo { hasNextPage endCursor }
            }
          } }
        }`,
          variables: { owner: repository.owner, name: repository.name, number, cursor },
        }),
      })
    );
    const graphRepository = object(object(result?.data)?.repository);
    const references = object(object(graphRepository?.pullRequest)?.closingIssuesReferences);
    if (result?.errors || !Array.isArray(references?.nodes)) {
      throw new GitHubError(502, "github_unavailable", "GitHub issue references could not be read");
    }
    for (const value of references.nodes) {
      const reference = object(value);
      const repositoryId = integer(object(reference?.repository)?.databaseId);
      const issueNumber = integer(reference?.number);
      if (
        repositoryId !== null &&
        BigInt(repositoryId) === repository.repositoryId &&
        issueNumber !== null
      )
        issueNumbers.push(issueNumber);
    }
    const page = object(references.pageInfo);
    cursor = page?.hasNextPage === true ? string(page.endCursor) : null;
    if (page?.hasNextPage === true && !cursor)
      throw new GitHubError(
        502,
        "github_unavailable",
        "GitHub omitted the next issue-reference page"
      );
  } while (cursor);
  return { id: BigInt(id), number, state, updatedAt, branch, issueNumbers };
}

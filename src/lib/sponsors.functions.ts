import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { DEFAULT_SPONSORS, type SponsorsFile } from "./sponsors-types";

const FILE_PATH = "data/sponsors.json";

const REPO_RE = /^[^\s/]+\/[^\s/]+$/;

// Constant-time string compare. Avoids early-exit timing leaks.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Best-effort per-IP rate limiter for the admin password endpoint.
const ADMIN_RL_MAX = 5;
const ADMIN_RL_WINDOW_MS = 10 * 60 * 1000;
const adminHits = new Map<string, number[]>();

function adminRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - ADMIN_RL_WINDOW_MS;
  const prior = (adminHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (prior.length >= ADMIN_RL_MAX) {
    adminHits.set(ip, prior);
    return false;
  }
  prior.push(now);
  adminHits.set(ip, prior);
  if (adminHits.size > 2000) {
    for (const [k, v] of adminHits) {
      const fresh = v.filter((t) => t > cutoff);
      if (fresh.length === 0) adminHits.delete(k);
      else adminHits.set(k, fresh);
    }
  }
  return true;
}

function clientIp(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function getGithubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repoRaw = process.env.GITHUB_REPO;
  const branchRaw = process.env.GITHUB_BRANCH;
  const repo = repoRaw?.trim().replace(/^\/+|\/+$/g, "");
  const branch = (branchRaw?.trim() || "main").replace(/^\/+|\/+$/g, "");
  if (!token || !repo) return null;
  if (!REPO_RE.test(repo)) {
    throw new Error(`GITHUB_REPO is malformed. Expected "owner/repo", got "${repo}".`);
  }
  return { token, repo, branch };
}

async function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "portfolio-admin",
  } as const;
}

async function diagnoseGithubAccess(cfg: {
  token: string;
  repo: string;
  branch: string;
}): Promise<string> {
  const headers = await ghHeaders(cfg.token);
  const repoRes = await fetch(`https://api.github.com/repos/${cfg.repo}`, {
    headers,
  });
  if (repoRes.status === 401) {
    return `GitHub rejected the token (401). Update GITHUB_TOKEN with a token that has "Contents: read & write" on ${cfg.repo}.`;
  }
  if (repoRes.status === 403) {
    return `GitHub denied access (403). The token cannot reach ${cfg.repo} - check SSO authorization and "Contents" permission.`;
  }
  if (repoRes.status === 404) {
    return `Repository "${cfg.repo}" was not found, or the token has no access to it.`;
  }
  if (!repoRes.ok) {
    return `GitHub repo check failed: ${repoRes.status}.`;
  }
  const branchRes = await fetch(
    `https://api.github.com/repos/${cfg.repo}/branches/${encodeURIComponent(cfg.branch)}`,
    { headers },
  );
  if (branchRes.status === 404) {
    return `Branch "${cfg.branch}" does not exist on ${cfg.repo}.`;
  }
  if (!branchRes.ok) {
    return `GitHub branch check failed: ${branchRes.status}.`;
  }
  return `GitHub write to ${cfg.repo}@${cfg.branch}:${FILE_PATH} failed. The token likely lacks "Contents: write" permission.`;
}

type GhContentResp = { content: string; sha: string };

async function fetchFromGithub(): Promise<{
  data: SponsorsFile;
  sha: string | null;
}> {
  const cfg = getGithubConfig();
  if (!cfg) return { data: DEFAULT_SPONSORS, sha: null };
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${FILE_PATH}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: await ghHeaders(cfg.token) });
  if (res.status === 404) return { data: DEFAULT_SPONSORS, sha: null };
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub read failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as GhContentResp;
  try {
    const decoded =
      typeof atob !== "undefined"
        ? atob(json.content.replace(/\n/g, ""))
        : Buffer.from(json.content, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as SponsorsFile;
    return { data: parsed, sha: json.sha };
  } catch {
    return { data: DEFAULT_SPONSORS, sha: json.sha };
  }
}

async function writeToGithub(next: SponsorsFile, prevSha: string | null): Promise<void> {
  const cfg = getGithubConfig();
  if (!cfg) throw new Error("GitHub storage is not configured.");
  const body = JSON.stringify(next, null, 2) + "\n";
  const contentB64 =
    typeof btoa !== "undefined"
      ? btoa(unescape(encodeURIComponent(body)))
      : Buffer.from(body, "utf8").toString("base64");
  const url = `https://api.github.com/repos/${cfg.repo}/contents/${FILE_PATH}`;
  const payload: Record<string, unknown> = {
    message: `chore(sponsors): update via admin panel`,
    content: contentB64,
    branch: cfg.branch,
  };
  if (prevSha) payload.sha = prevSha;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...(await ghHeaders(cfg.token)),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await diagnoseGithubAccess(cfg);
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    }
    throw new Error(`GitHub write failed (${res.status}). ${detail}`);
  }
}

/** Public read: returns sponsors file for display. */
export const getSponsors = createServerFn({ method: "GET" }).handler(
  async (): Promise<SponsorsFile> => {
    try {
      const { data } = await fetchFromGithub();
      return data;
    } catch (err) {
      console.error("[sponsors] read failed:", err);
      return DEFAULT_SPONSORS;
    }
  },
);

const sponsorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  logoUrl: z
    .string()
    .url()
    .refine((v) => /^https?:\/\//i.test(v), "logoUrl must be http(s)")
    .or(z.literal(""))
    .default(""),
  url: z
    .string()
    .url()
    .refine((v) => /^https?:\/\//i.test(v), "url must be http(s)"),
  tagline: z.string().max(200).default(""),
  active: z.boolean(),
  weight: z.number().int().min(1).max(100).default(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const fileSchema = z.object({
  rotationSeconds: z.number().int().min(3).max(3600),
  sponsors: z.array(sponsorSchema).max(50),
});

const saveInputSchema = z.object({
  password: z.string().min(1),
  file: fileSchema,
});

/** Password-gated admin write. */
export const saveSponsors = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveInputSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (!adminRateLimit(clientIp())) {
      throw new Error("Too many attempts. Try again later.");
    }
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected || !timingSafeEqual(data.password, expected)) {
      throw new Error("Unauthorized");
    }
    const { sha } = await fetchFromGithub();
    await writeToGithub(data.file, sha);
    return { ok: true };
  });

/** Password check for admin login. */
export const checkAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ password: z.string() }).parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!adminRateLimit(clientIp())) {
      throw new Error("Too many attempts. Try again later.");
    }
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return { ok: false };
    return { ok: timingSafeEqual(data.password, expected) };
  });

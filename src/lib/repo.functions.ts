import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the configured GitHub repo (owner/name) so the client can build
 * "latest release" download URLs. Returns null when unset.
 */
export const getGithubRepo = createServerFn({ method: "GET" }).handler(async () => {
  const repo = process.env.GITHUB_REPO ?? null;
  return { repo };
});

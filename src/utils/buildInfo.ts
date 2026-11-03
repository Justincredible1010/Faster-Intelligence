import { execSync } from 'node:child_process';

export interface BuildInfo {
  commit: string;
  buildDate: string;
}

/**
 * Resolves the commit SHA and build date baked into the client bundle.
 * Order: explicit env (APP_COMMIT_SHA, then common CI vars), then git, then 'unknown'.
 * AI Studio checkouts may have no .git directory, so git is optional.
 */
export function resolveBuildInfo(
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
  gitSha: () => string | null = readGitSha
): BuildInfo {
  const fromEnv = env.APP_COMMIT_SHA || env.GITHUB_SHA || env.COMMIT_SHA || env.K_REVISION;
  const raw = (fromEnv || gitSha() || '').trim();
  const commit = /^[0-9a-f]{7,40}$/i.test(raw) ? raw.slice(0, 7).toLowerCase() : raw ? raw.slice(0, 40) : 'unknown';
  const buildDate = (env.APP_BUILD_DATE || now.toISOString()).slice(0, 10);
  return { commit, buildDate };
}

function readGitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

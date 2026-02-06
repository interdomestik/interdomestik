import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function resolveGitSha() {
  try {
    const sha = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (sha) return sha;
  } catch {
    // Fall back to env-based commit SHA in containerized CI contexts without git.
  }

  const envSha =
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.COMMIT_SHA;

  return envSha?.trim() || 'unknown';
}

const gitSha = resolveGitSha();
const stamp = { gitSha, builtAt: new Date().toISOString() };
const outDir = path.resolve('.next/standalone');
const outFile = path.join(outDir, '.build-stamp.json');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(stamp, null, 2)}\n`);

console.log(`[build-stamp] ${outFile} (${gitSha})`);

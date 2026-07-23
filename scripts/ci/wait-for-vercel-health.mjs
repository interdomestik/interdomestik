import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { fetchVercelHealth } from './fetch-vercel-health.mjs';

const HEALTH_CHECK_FAILED = 'Vercel health check failed';
const LOG_PREFIX = '[vercel-health]';

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function waitForVercelHealth({
  healthUrl,
  expectedCommitSha,
  attempts = positiveInt(process.env.VERCEL_HEALTH_MAX_ATTEMPTS, 30),
  sleepMs = positiveInt(process.env.VERCEL_HEALTH_SLEEP_SECONDS, 5) * 1000,
  fetchImpl = fetchVercelHealth,
  log = console.log,
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log(`${LOG_PREFIX} attempt ${attempt}/${attempts}`);
    try {
      const body = await fetchImpl({ healthUrl, expectedCommitSha });
      log(`${LOG_PREFIX} result=success`);
      return body;
    } catch {
      log(`${LOG_PREFIX} result=health_check_failed`);
      if (attempt < attempts) await sleep(sleepMs);
    }
  }
  throw new Error(HEALTH_CHECK_FAILED);
}

async function main() {
  const [, , healthUrl, expectedCommitSha] = process.argv;
  if (!healthUrl) throw new Error('healthUrl is required');
  if (process.argv.length > 3 && !expectedCommitSha) {
    throw new Error('expectedCommitSha must not be empty when provided');
  }
  await waitForVercelHealth({ healthUrl, expectedCommitSha });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch {
    process.stderr.write(`${HEALTH_CHECK_FAILED}\n`);
    process.exitCode = 1;
  }
}

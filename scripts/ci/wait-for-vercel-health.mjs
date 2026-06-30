import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { fetchVercelHealth } from './fetch-vercel-health.mjs';

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
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log(`Attempt ${attempt}/${attempts}: checking ${healthUrl}`);
    try {
      const body = await fetchImpl({ healthUrl, expectedCommitSha });
      log('Vercel health check succeeded.');
      return body;
    } catch (error) {
      lastError = error;
      log(`Vercel health check failed: ${error.message}`);
      if (attempt < attempts) await sleep(sleepMs);
    }
  }
  throw lastError || new Error('Vercel health check failed');
}

async function main() {
  const [, , healthUrl, expectedCommitSha] = process.argv;
  if (!healthUrl) throw new Error('healthUrl is required');
  if (process.argv.length > 3 && !expectedCommitSha) {
    throw new Error('expectedCommitSha must not be empty when provided');
  }
  const body = await waitForVercelHealth({ healthUrl, expectedCommitSha });
  process.stdout.write(`${body}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

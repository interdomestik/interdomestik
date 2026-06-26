import { pathToFileURL } from 'node:url';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function requireValue(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parsePositiveInteger(name, value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function assertExpectedUrl(url, expectedHost) {
  if (url.protocol !== 'https:') {
    throw new Error(`Attestation URL must use https: ${url.href}`);
  }
  if (url.host !== expectedHost) {
    throw new Error(`Attestation redirect crossed host boundary: ${expectedHost} -> ${url.host}`);
  }
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchVercelAttestation({
  metadataUrl,
  expectedHost,
  fetchImpl = fetch,
  maxRedirects = 1,
  timeoutMs = 30_000,
}) {
  const host = requireValue('expectedHost', expectedHost);
  let currentUrl = new URL(requireValue('metadataUrl', metadataUrl));
  assertExpectedUrl(currentUrl, host);

  for (let redirects = 0; ; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(currentUrl, { redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects >= maxRedirects) {
        throw new Error(`Attestation redirect limit exceeded for ${currentUrl.href}`);
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Attestation redirect missing Location header for ${currentUrl.href}`);
      }
      currentUrl = new URL(location, currentUrl);
      assertExpectedUrl(currentUrl, host);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Attestation fetch failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
}

async function main() {
  const retries = parsePositiveInteger(
    'ATTESTATION_FETCH_RETRIES',
    process.env.ATTESTATION_FETCH_RETRIES ?? '6'
  );
  const retryDelayMs =
    parsePositiveInteger(
      'ATTESTATION_FETCH_RETRY_DELAY_SECONDS',
      process.env.ATTESTATION_FETCH_RETRY_DELAY_SECONDS ?? '5'
    ) * 1000;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const metadata = await fetchVercelAttestation({
        metadataUrl: process.env.METADATA_URL,
        expectedHost: process.env.ATTESTATION_HOST,
      });
      process.stdout.write(metadata);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }
  }
  throw lastError;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

import { pathToFileURL } from 'node:url';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const VERCEL_HOST = /^(?:[a-z0-9_.-]+\.)?vercel\.app$/u;

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

function envInteger(name, fallback) {
  return parsePositiveInteger(name, process.env[name] ?? fallback);
}

function buildRequestUrl(url, expectedHost) {
  if (url.protocol !== 'https:') throw new Error('URL must use https');
  if (url.host !== expectedHost) throw new Error('Attestation crossed host boundary');

  // Assign parsed components separately so the resource cannot change the origin.
  const requestUrl = new URL('https://vercel.app');
  requestUrl.hostname = expectedHost;
  requestUrl.pathname = url.pathname;
  requestUrl.search = url.search || (url.href.split('#', 1)[0].endsWith('?') ? '?' : '');
  requestUrl.hash = url.hash || (url.href.endsWith('#') ? '#' : '');
  requestUrl.username = url.username;
  requestUrl.password = url.password;
  return requestUrl;
}

function assertJsonResponse(response, url) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      `Attestation fetch failed for ${url.href}: expected JSON, got ${contentType || 'missing'}`
    );
  }
}

function buildRequestInit(secret, controller) {
  const init = { redirect: 'manual', signal: controller.signal };
  if (secret) init.headers = { 'x-vercel-protection-bypass': secret };
  return init;
}

function nextRedirectUrl(response, currentUrl, redirects, maxRedirects) {
  if (!REDIRECT_STATUSES.has(response.status)) return null;
  if (redirects >= maxRedirects) throw new Error('Attestation redirect limit exceeded');
  const location = response.headers.get('location');
  if (!location) throw new Error('Attestation redirect missing Location header');
  const nextUrl = new URL(location, currentUrl);
  if (nextUrl.hostname === 'vercel.com' && nextUrl.pathname.startsWith('/sso-api')) {
    throw new Error('Attestation requires VERCEL_AUTOMATION_BYPASS_SECRET');
  }
  return nextUrl;
}
async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchVercelAttestation({
  metadataUrl,
  expectedHost,
  bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  fetchImpl = fetch,
  maxRedirects = 1,
  timeoutMs = 30_000,
}) {
  const host = requireValue('expectedHost', expectedHost ?? new URL(metadataUrl).host)
    .trim()
    .toLowerCase();
  const secret = typeof bypassSecret === 'string' ? bypassSecret.trim() : '';
  if (!VERCEL_HOST.test(host)) throw new Error('Host must be vercel.app or *.vercel.app');
  let targetUrl = new URL(requireValue('metadataUrl', metadataUrl));

  for (let redirects = 0; ; redirects += 1) {
    const currentUrl = buildRequestUrl(targetUrl, host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(currentUrl, buildRequestInit(secret, controller));
    } finally {
      clearTimeout(timer);
    }
    targetUrl = nextRedirectUrl(response, currentUrl, redirects, maxRedirects);
    if (targetUrl) continue;

    if (!response.ok) {
      throw new Error(`Attestation fetch failed: ${response.status}`);
    }
    assertJsonResponse(response, currentUrl);
    return response.text();
  }
}

export async function fetchVercelAttestationWithRetries({
  retries,
  retryDelayMs,
  sleepImpl = sleep,
  ...fetchOptions
}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchVercelAttestation(fetchOptions);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleepImpl(retryDelayMs);
      }
    }
  }
  throw lastError;
}

async function main() {
  const retries = envInteger('ATTESTATION_FETCH_RETRIES', '6');
  const retryDelayMs = envInteger('ATTESTATION_FETCH_RETRY_DELAY_SECONDS', '5') * 1000;
  const timeoutMs = envInteger('ATTESTATION_FETCH_TIMEOUT_MS', '30000');
  const maxRedirects = envInteger('ATTESTATION_FETCH_MAX_REDIRECTS', '1');

  const metadata = await fetchVercelAttestationWithRetries({
    metadataUrl: process.env.METADATA_URL,
    expectedHost: process.env.ATTESTATION_HOST,
    retries,
    retryDelayMs,
    timeoutMs,
    maxRedirects,
  });
  process.stdout.write(metadata);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

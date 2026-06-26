import { execFile as execFileCallback } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const STATUS_MARKER = '\n__INTERDOMESTIK_HEALTH_STATUS__:';

function requireValue(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isVercelAppUrl(value) {
  const hostname = value.hostname.toLowerCase();
  return /^interdomestik(?:-web)?(?:-[a-z0-9-]+)?-ecohub\.vercel\.app$/u.test(hostname);
}

function isAllowedHealthUrl(value) {
  const hostname = value.hostname.toLowerCase();
  return isVercelAppUrl(value) || hostname === 'www.interdomestik.com' || hostname === 'interdomestik.com';
}

function parseVercelHealthUrl(value) {
  const url = new URL(requireValue('healthUrl', value));
  if (url.protocol !== 'https:') throw new Error('Health URL must use https');
  if (!isAllowedHealthUrl(url)) throw new Error('Health URL must use an allowed deployment host');
  if (url.pathname.replace(/\/+/g, '/') !== '/api/health') {
    throw new Error('Health URL must target /api/health');
  }
  return new URL(`https://${url.hostname.toLowerCase()}/api/health`);
}

function buildHeaders(url) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret || !isVercelAppUrl(url)) return {};
  return { 'x-vercel-protection-bypass': secret };
}

function sanitizeHealthBody(body) {
  return body
    .replace(/postgres(?:ql)?:\/\/[^"'\s]+/giu, 'postgres://[redacted]')
    .replace(/(DATABASE_URL(?:_RLS)?=)[^"'\s]+/giu, '$1[redacted]')
    .replace(/(password|token|secret|key)["']?\s*[:=]\s*["']?[^"',\s}]+/giu, '$1:[redacted]')
    .slice(0, 1_200);
}

async function requestVercelHealth(url, headers, timeoutMs, execFileImpl = execFile) {
  const args = [
    '--silent',
    '--show-error',
    '--max-time',
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    '--write-out',
    `${STATUS_MARKER}%{http_code}`,
  ];
  for (const [name, value] of Object.entries(headers)) {
    args.push('--header', `${name}: ${value}`);
  }
  args.push('--', url.href);

  const { stdout } = await execFileImpl('curl', args, {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  const markerIndex = stdout.lastIndexOf(STATUS_MARKER);
  if (markerIndex < 0) throw new Error('Health endpoint response did not include status');
  const status = Number(stdout.slice(markerIndex + STATUS_MARKER.length).trim());
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => stdout.slice(0, markerIndex),
  };
}

export async function fetchVercelHealth({
  healthUrl,
  expectedCommitSha,
  requestImpl = requestVercelHealth,
  timeoutMs = 10_000,
}) {
  const url = parseVercelHealthUrl(healthUrl);
  const response = await requestImpl(url, buildHeaders(url), timeoutMs);
  if (response.status >= 300 && response.status < 400) {
    throw new Error('Health endpoint redirected before returning /api/health');
  }
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Health endpoint returned ${response.status}: ${sanitizeHealthBody(body) || '[empty body]'}`
    );
  }
  if (!expectedCommitSha) return body;
  const actual = JSON.parse(body)?.build?.commitSha;
  if (actual !== expectedCommitSha) {
    throw new Error(
      `Deployed build provenance mismatch: expected ${expectedCommitSha}, got ${actual || 'missing'}`
    );
  }
  return body;
}

async function main() {
  if (process.argv.length > 3 && !process.argv[3]) {
    throw new Error('expectedCommitSha must not be empty when provided');
  }
  const body = await fetchVercelHealth({
    healthUrl: process.argv[2],
    expectedCommitSha: process.argv[3],
  });
  process.stdout.write(`${body}\n`);
  if (process.argv[3]) console.log(`Deployed build provenance verified: ${process.argv[3]}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

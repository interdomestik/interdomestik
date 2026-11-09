import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { BlockList, isIPv4 } from 'node:net';
import { pathToFileURL } from 'node:url';

// Temporary: remove with the three CD steps once the owner repairs the NS delegation.
// Derived from cd.yml AUTH_BASE_URL, vercel-staging-alias-state.mjs and release-gate:
// KS/MK accounts share the canonical base URL; tenant IDs are request headers, not hosts.
export const STAGING_HOSTS = Object.freeze(['staging.interdomestik.com']);
export const STAGING_JOBS = Object.freeze([
  'deploy-staging',
  'e2e-staging',
  'rollback-staging-alias',
]);
const PROVIDERS = Object.freeze([
  'https://cloudflare-dns.com/dns-query',
  'https://dns.google/resolve',
]);
const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
])
  NON_PUBLIC.addSubnet(network, prefix, 'ipv4');

export function isPublicIpv4(address) {
  return typeof address === 'string' && isIPv4(address) && !NON_PUBLIC.check(address, 'ipv4');
}

function requireAllowedHost(host) {
  if (!STAGING_HOSTS.includes(host)) throw new Error('host is outside the staging DNS allowlist');
}

export function renderHostsLine(address, host) {
  requireAllowedHost(host);
  if (!isPublicIpv4(address)) throw new Error('hosts pin requires a public IPv4 address');
  return `${address} ${host}\n`;
}

async function withTimeout(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('DNS timeout')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function systemResolves(host, lookupImpl, timeoutMs) {
  try {
    const result = await withTimeout(() => lookupImpl(host, { family: 4 }), timeoutMs);
    return typeof result?.address === 'string' && isIPv4(result.address);
  } catch {
    return false;
  }
}

async function resolveProvider(endpoint, host, fetchImpl) {
  const url = new URL(endpoint);
  url.searchParams.set('name', host);
  url.searchParams.set('type', 'A');
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(5_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('DoH HTTP failure');
  const body = await response.json();
  if (body?.Status !== 0 || body.TC === true || !Array.isArray(body.Answer)) return [];
  return body.Answer.filter(record => record?.type === 1 && isPublicIpv4(record.data)).map(
    record => record.data
  );
}

function appendHosts(line) {
  // /etc/hosts covers Linux Chromium, curl and Node. TLS still validates the original
  // hostname's certificate: pinning changes resolution, never the application's TLS trust.
  const result = spawnSync('/usr/bin/sudo', ['-n', '/usr/bin/tee', '-a', '/etc/hosts'], {
    input: line,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'ignore'],
    timeout: 5_000,
  });
  if (result.error || result.status !== 0) throw new Error('hosts append failed');
}

export async function pinStagingHost(
  host,
  { lookupImpl = lookup, fetchImpl = fetch, writeImpl = appendHosts, lookupTimeoutMs = 1_500 } = {}
) {
  requireAllowedHost(host);
  // Prefer a job-long pin: a working system resolver can fail later in the same job.
  let answers = [[], []];
  let reason = 'DoH providers have no shared public IPv4';
  try {
    answers = await Promise.all(
      PROVIDERS.map(endpoint => resolveProvider(endpoint, host, fetchImpl))
    );
  } catch {
    reason = 'DoH provider unavailable or invalid response';
  }
  const address = answers[0].find(candidate => answers[1].includes(candidate));
  if (!address) {
    if (await systemResolves(host, lookupImpl, lookupTimeoutMs)) return { status: 'system' };
    return { status: 'failed', reason };
  }
  try {
    await writeImpl(renderHostsLine(address, host));
    return { status: 'pinned', address };
  } catch {
    return { status: 'failed', reason: 'could not append the agreed address to /etc/hosts' };
  }
}

export async function runStagingDnsPin({ env = process.env, logImpl = console.log, ...io } = {}) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_WORKFLOW !== 'CD' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    env.RUNNER_OS !== 'Linux' ||
    !STAGING_JOBS.includes(env.GITHUB_JOB)
  ) {
    logImpl('::error::staging-dns requires a GitHub-hosted Linux staging CD job');
    return 1;
  }
  const rollback = env.GITHUB_JOB === 'rollback-staging-alias';
  const failureLevel = rollback ? 'warning' : 'error';
  const results = await Promise.all(
    STAGING_HOSTS.map(async host => {
      const result = await pinStagingHost(host, io);
      const message = `staging-dns ${host} ${result.status}`;
      if (result.status === 'failed') logImpl(`::${failureLevel}::${message} ${result.reason}`);
      else if (result.status === 'pinned') logImpl(`${message} ${result.address}`);
      else logImpl(message);
      return result;
    })
  );
  return !rollback && results.some(result => result.status === 'failed') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    console.error('::error::staging-dns accepts no arguments; the host allowlist is fixed');
    process.exitCode = 1;
  } else {
    process.exitCode = await runStagingDnsPin();
  }
}

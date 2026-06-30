import { pathToFileURL } from 'node:url';

const VERCEL_TEAM_SLUG = 'ecohub';
const DEFAULT_ALIAS_ATTEMPTS = 4;
const DEFAULT_ALIAS_RETRY_MS = 5_000;

export function cleanHostname(value) {
  return String(value || '')
    .replace(/^https?:\/\//u, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();
}

export function requireHostname(label, value) {
  const hostname = cleanHostname(value);
  const validLabels = hostname
    .split('.')
    .every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
  if (hostname.length > 253 || !validLabels) {
    throw new Error(`${label} must be a valid hostname`);
  }
  return hostname;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function aliasEndpoint(deploymentHostname, env) {
  const endpoint = new URL(
    `https://api.vercel.com/v2/deployments/${encodeURIComponent(deploymentHostname)}/aliases`
  );
  endpoint.searchParams.set('slug', VERCEL_TEAM_SLUG);
  return endpoint;
}

function compactBody(body) {
  return body.replace(/\s+/gu, ' ').trim().slice(0, 800);
}

function isTransientAliasFailure(status, body) {
  return (
    status === 400 &&
    /(cert .*not ready|deployment .*not ready|not READY|can not be aliased)/iu.test(body)
  );
}

export async function aliasStagingDeployment(
  deploymentHostname,
  aliasHostname,
  env = process.env,
  fetchImpl = fetch,
  waitImpl = delay
) {
  const token = env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN is required to assign the staging alias');

  console.error('Assigning canonical staging alias to the verified Vercel deployment');
  const endpoint = aliasEndpoint(deploymentHostname, env);
  const attempts = positiveInteger(env.STAGING_ALIAS_ATTEMPTS, DEFAULT_ALIAS_ATTEMPTS);
  const retryMs = positiveInteger(env.STAGING_ALIAS_RETRY_MS, DEFAULT_ALIAS_RETRY_MS);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ alias: aliasHostname, redirect: null }),
    });
    if (response.ok) return;

    const body = await response.text();
    if (response.status === 409 && /already assigned/iu.test(body)) {
      console.error('Canonical staging alias is already assigned to the verified Vercel deployment');
      return;
    }
    if (attempt < attempts && isTransientAliasFailure(response.status, body)) {
      console.error(`Canonical staging alias not ready yet; retrying (${attempt}/${attempts})`);
      await waitImpl(retryMs);
      continue;
    }
    throw new Error(
      `Failed to assign canonical staging alias: ${response.status} ${compactBody(body)}`
    );
  }
}

export async function resolveGateUrl(
  baseUrl,
  deploymentHostname,
  env = process.env,
  aliasImpl = aliasStagingDeployment
) {
  const deployEnvironment = env.DEPLOY_ENVIRONMENT || '';
  const deployProduction = env.DEPLOY_PRODUCTION || '';
  if (deployEnvironment !== 'staging' || deployProduction === 'true') {
    return { gateBaseUrl: baseUrl, gateHostname: deploymentHostname };
  }
  const aliasHostname = requireHostname(
    'STAGING_ALIAS_DOMAIN',
    env.STAGING_ALIAS_DOMAIN || 'staging.interdomestik.com'
  );
  await aliasImpl(deploymentHostname, aliasHostname, env);
  return { gateBaseUrl: `https://${aliasHostname}`, gateHostname: aliasHostname };
}

async function main() {
  const baseUrl = process.argv[2];
  const deploymentHostname = requireHostname('deployment hostname', process.argv[3]);
  if (!baseUrl?.startsWith('https://')) throw new Error('base URL must use https');
  const { gateBaseUrl, gateHostname } = await resolveGateUrl(baseUrl, deploymentHostname);
  process.stdout.write(`gate_base_url=${gateBaseUrl}\ngate_hostname=${gateHostname}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

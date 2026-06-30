import { pathToFileURL } from 'node:url';

const VERCEL_TEAM_SLUG = 'ecohub';

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

export async function aliasStagingDeployment(
  deploymentHostname,
  aliasHostname,
  env = process.env,
  fetchImpl = fetch
) {
  const token = env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN is required to assign the staging alias');

  console.error('Assigning canonical staging alias to the verified Vercel deployment');
  const endpoint = new URL(
    `https://api.vercel.com/v2/deployments/${encodeURIComponent(deploymentHostname)}/aliases`
  );
  endpoint.searchParams.set('teamSlug', VERCEL_TEAM_SLUG);

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ alias: aliasHostname }),
  });
  if (response.ok) return;

  const body = await response.text();
  if (response.status === 409 && /already assigned/i.test(body)) {
    console.error('Canonical staging alias is already assigned to the verified Vercel deployment');
    return;
  }
  throw new Error(`Failed to assign canonical staging alias: ${response.status}`);
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

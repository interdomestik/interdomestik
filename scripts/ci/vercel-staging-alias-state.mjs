import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchVercelHealth } from './fetch-vercel-health.mjs';
import { waitForVercelHealth } from './wait-for-vercel-health.mjs';
export const CANONICAL_STAGING_ALIAS = 'staging.interdomestik.com';
const ALIAS_DEFAULTS = { teamSlug: 'ecohub', attempts: 4, retryMs: 5_000 };
function requireValue(name, value) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${name} is required`);
  return result;
}
function deploymentHost(value) {
  const host = String(value || '').toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/u.test(host))
    throw new Error('preimage must be a valid Vercel deployment hostname');
  return host;
}
function canonicalAlias(value = CANONICAL_STAGING_ALIAS) {
  if (String(value).toLowerCase() !== CANONICAL_STAGING_ALIAS)
    throw new Error(`canonical staging alias must be ${CANONICAL_STAGING_ALIAS}`);
  return CANONICAL_STAGING_ALIAS;
}
function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function scopedUrl(pathname, teamId) {
  const url = new URL(`https://api.vercel.com${pathname}`);
  url.searchParams.set('teamId', teamId);
  return url;
}
function assignmentUrl(hostname) {
  return new URL(
    `https://api.vercel.com/v2/deployments/${encodeURIComponent(hostname)}/aliases?slug=${ALIAS_DEFAULTS.teamSlug}`
  );
}
export function boundedProviderText(value) {
  return String(value || '')
    .replace(
      /(token|secret|password|key)(?:["']?\s*[:=]\s*["']?|\s+)[^"',\s}]+/giu,
      '$1=[redacted]'
    )
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 180);
}
async function providerJson(response, label) {
  const body = await response.text();
  if (!response.ok)
    throw new Error(`${label} failed (${response.status}): ${boundedProviderText(body)}`);
  try {
    const parsed = JSON.parse(body);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
      throw new Error('Provider response must be a JSON object');
    return parsed;
  } catch {
    throw new Error(`${label} returned an invalid response`);
  }
}
export async function aliasStagingDeployment(
  deploymentHostname,
  aliasHostname,
  env = process.env,
  fetchImpl = fetch,
  waitImpl = delay
) {
  const token = requireValue('VERCEL_TOKEN', env.VERCEL_TOKEN);
  const attempts = positiveInt(env.STAGING_ALIAS_ATTEMPTS, ALIAS_DEFAULTS.attempts);
  const retryMs = positiveInt(env.STAGING_ALIAS_RETRY_MS, ALIAS_DEFAULTS.retryMs);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchImpl(assignmentUrl(deploymentHostname), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ alias: aliasHostname, redirect: null }),
    });
    if (response.ok) return;
    const body = await response.text();
    if (response.status === 409 && /already assigned/iu.test(body)) return;
    const transient =
      response.status === 400 &&
      /(cert .*not ready|deployment .*not ready|not READY|can not be aliased)/iu.test(body);
    if (attempt < attempts && transient) {
      await waitImpl(retryMs);
      continue;
    }
    throw new Error(
      `Failed to assign canonical staging alias: ${response.status} ${boundedProviderText(body)}`
    );
  }
}
export async function snapshotStagingAlias({
  env = process.env,
  fetchImpl = fetch,
  healthImpl = fetchVercelHealth,
} = {}) {
  const alias = canonicalAlias(env.STAGING_ALIAS_DOMAIN);
  const token = requireValue('VERCEL_TOKEN', env.VERCEL_TOKEN);
  const teamId = requireValue('VERCEL_ORG_ID', env.VERCEL_ORG_ID);
  const projectId = requireValue('VERCEL_PROJECT_ID', env.VERCEL_PROJECT_ID);
  const init = { headers: { authorization: `Bearer ${token}` } };
  const aliasState = await providerJson(
    await fetchImpl(scopedUrl(`/v4/aliases/${encodeURIComponent(alias)}`, teamId), init),
    'Vercel alias lookup'
  );
  if (aliasState.alias !== alias) throw new Error('canonical staging alias missing');
  if (aliasState.redirect) throw new Error('canonical staging alias must not redirect');
  const deploymentHostname = deploymentHost(aliasState.deployment?.url);
  const deployment = await providerJson(
    await fetchImpl(
      scopedUrl(`/v13/deployments/${encodeURIComponent(deploymentHostname)}`, teamId),
      init
    ),
    'Vercel deployment lookup'
  );
  const resolvedTeam = deployment.teamId || deployment.team?.id;
  if (
    deploymentHost(deployment.url) !== deploymentHostname ||
    deployment.projectId !== projectId ||
    resolvedTeam !== teamId
  ) {
    throw new Error('Vercel deployment project/team ownership mismatch');
  }
  const body = await healthImpl({ healthUrl: `https://${deploymentHostname}/api/health` });
  const commitSha = JSON.parse(body)?.build?.commitSha;
  if (!/^[a-f0-9]{40}$/u.test(commitSha || '')) {
    throw new Error('preimage health must expose a full lowercase commit SHA');
  }
  return { deploymentHostname, commitSha };
}
export async function restoreStagingAlias({
  deploymentHostname,
  commitSha,
  env = process.env,
  aliasImpl = aliasStagingDeployment,
  healthImpl = waitForVercelHealth,
}) {
  const hostname = deploymentHost(deploymentHostname);
  if (!/^[a-f0-9]{40}$/u.test(commitSha || '')) throw new Error('invalid preimage commit SHA');
  const alias = canonicalAlias(env.STAGING_ALIAS_DOMAIN);
  await aliasImpl(hostname, alias, env);
  await healthImpl({ healthUrl: `https://${alias}/api/health`, expectedCommitSha: commitSha });
}
export async function writeAliasReceipt(filePath, receipt) {
  const target = requireValue('receipt path', filePath);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, ...receipt })}\n`, { mode: 0o600 });
  await rename(temporary, target);
}

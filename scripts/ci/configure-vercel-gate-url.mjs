import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import * as state from './vercel-staging-alias-state.mjs';

export const aliasStagingDeployment = state.aliasStagingDeployment;
export function cleanHostname(value) {
  const text = String(value || '').replace(/^https?:\/\//u, '');
  return text.split(/[/:]/u)[0].toLowerCase();
}
export function requireHostname(label, value) {
  const hostname = cleanHostname(value);
  const valid =
    hostname.length <= 253 &&
    hostname.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(part));
  if (!valid) throw new Error(`${label} must be a valid hostname`);
  return hostname;
}

export async function resolveGateUrl(
  baseUrl,
  hostname,
  env = process.env,
  assign = aliasStagingDeployment
) {
  if (env.DEPLOY_ENVIRONMENT !== 'staging' || env.DEPLOY_PRODUCTION === 'true') {
    return { gateBaseUrl: baseUrl, gateHostname: hostname };
  }
  const requested = env.STAGING_ALIAS_DOMAIN || state.CANONICAL_STAGING_ALIAS;
  const alias = requireHostname('STAGING_ALIAS_DOMAIN', requested);
  if (alias !== state.CANONICAL_STAGING_ALIAS) {
    throw new Error(`STAGING_ALIAS_DOMAIN must be ${state.CANONICAL_STAGING_ALIAS}`);
  }
  await assign(hostname, alias, env);
  return { gateBaseUrl: `https://${alias}`, gateHostname: alias };
}

function receiptPath(name) {
  const result = process.env[name]?.trim();
  if (!result) throw new Error(`${name} is required`);
  return result;
}

export function validatePreimageReceipt(value) {
  const hostname = requireHostname('preimage deployment hostname', value?.deploymentHostname);
  const receipt = { ...value, deploymentHostname: hostname };
  if (
    receipt.version !== 1 ||
    receipt.alias !== state.CANONICAL_STAGING_ALIAS ||
    value?.deploymentHostname !== hostname ||
    !receipt.deploymentHostname.endsWith('.vercel.app') ||
    !/^[a-f0-9]{40}$/u.test(receipt.commitSha || '') ||
    typeof receipt.aliasMoved !== 'boolean'
  )
    throw new Error('invalid staging alias preimage receipt');
  return receipt;
}

async function readPreimage() {
  const source = await readFile(receiptPath('STAGING_PREIMAGE_RECEIPT_PATH'), 'utf8');
  return validatePreimageReceipt(JSON.parse(source));
}
async function writeRollback(receipt, outcome, error) {
  await state.writeAliasReceipt(receiptPath('STAGING_ROLLBACK_RECEIPT_PATH'), {
    ...receipt,
    outcome,
    ...(error ? { error: state.boundedProviderText(error?.message) } : {}),
  });
}

export async function guardRollback() {
  let receipt = { alias: state.CANONICAL_STAGING_ALIAS };
  try {
    receipt = await readPreimage();
    if (!receipt.aliasMoved) await writeRollback(receipt, 'not-required');
    process.stdout.write(`should_restore=${receipt.aliasMoved}\n`);
    return receipt.aliasMoved;
  } catch (error) {
    if (error?.code === 'ENOENT' && process.env.STAGING_ALIAS_MOVED_SIGNAL !== 'true') {
      await writeRollback(receipt, 'not-required');
      process.stdout.write('should_restore=false\n');
      return false;
    }
    const failure =
      error?.code === 'ENOENT'
        ? new Error('confirmed alias movement has no usable staging preimage receipt')
        : error;
    await writeRollback(receipt, 'failed', failure);
    throw failure;
  }
}

async function restore() {
  let receipt = { alias: state.CANONICAL_STAGING_ALIAS };
  try {
    receipt = await readPreimage();
    if (!receipt.aliasMoved) throw new Error('staging alias movement was not confirmed');
    await state.restoreStagingAlias(receipt);
    await writeRollback(receipt, 'restored');
  } catch (error) {
    await writeRollback(receipt, 'failed', error);
    throw error;
  }
}

async function deploy() {
  const baseUrl = process.argv[2];
  const hostname = requireHostname('deployment hostname', process.argv[3]);
  if (!baseUrl?.startsWith('https://')) throw new Error('base URL must use https');
  let receipt;
  let aliasImpl = aliasStagingDeployment;
  if (process.env.DEPLOY_ENVIRONMENT === 'staging' && process.env.DEPLOY_PRODUCTION !== 'true') {
    const preimage = await state.snapshotStagingAlias();
    const target = receiptPath('STAGING_PREIMAGE_RECEIPT_PATH');
    receipt = { alias: state.CANONICAL_STAGING_ALIAS, ...preimage, aliasMoved: false };
    await state.writeAliasReceipt(target, receipt);
    console.error(`Staging alias preimage: ${preimage.deploymentHostname} ${preimage.commitSha}`);
    aliasImpl = async (...args) => {
      await aliasStagingDeployment(...args);
      receipt = { ...receipt, aliasMoved: true };
      await state.writeAliasReceipt(target, receipt);
    };
  }
  const gate = await resolveGateUrl(baseUrl, hostname, process.env, aliasImpl);
  let output = `gate_base_url=${gate.gateBaseUrl}\ngate_hostname=${gate.gateHostname}\n`;
  if (receipt) {
    output += `previous_deployment_hostname=${receipt.deploymentHostname}\n`;
    output += `previous_commit_sha=${receipt.commitSha}\nalias_moved=true\n`;
  }
  process.stdout.write(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requestedCommand = process.argv[2];
  let command = deploy;
  if (requestedCommand === 'guard') command = guardRollback;
  else if (requestedCommand === 'restore') command = restore;
  await command().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

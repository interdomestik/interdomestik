import fs from 'node:fs';
import { verifyOrdinaryProvenance, verifyM4C0UnitProvenance } from './ordinary-provenance.mjs';
export { verifyOrdinaryProvenance } from './ordinary-provenance.mjs';
import { consumeM4C0ArtifactAuthority } from './bootstrap.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateOrdinaryGeometry } from './coverage-completeness.mjs';
import { safeEnv } from '../db-access-provider-runtime-identity.mjs';
const API = 'https://api.github.com/repos/interdomestik/interdomestik';
const SHA = /^[a-f0-9]{40}$/u;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => {
  throw Error('P2 ordinary artifact refused: ' + message);
};
export function parseUntrustedJSON(bytes, limit = 128 * 1024 * 1024) {
  if (bytes.byteLength > limit) fail('JSON byte cap');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  let nodes = 0;
  const visit = (v, depth) => {
    if (depth > 40 || ++nodes > 2000000) fail('JSON complexity cap');
    if (v && typeof v === 'object') {
      for (const [key, item] of Object.entries(v)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('prototype key');
        visit(item, depth + 1);
      }
    } else if (typeof v === 'number' && !Number.isFinite(v)) fail('nonfinite number');
  };
  visit(value, 0);
  return value;
}
function relative(file) {
  return (
    typeof file === 'string' &&
    !path.isAbsolute(file) &&
    !file.includes('\\') &&
    !file.includes('\0') &&
    file.split('/').every(x => x && x !== '.' && x !== '..')
  );
}
export function expectedCoverageFiles(domainPackages) {
  if (
    !Array.isArray(domainPackages) ||
    domainPackages.some(name => !/^domain-[a-z0-9-]+$/u.test(name)) ||
    new Set(domainPackages).size !== domainPackages.length
  )
    fail('package discovery');
  return [
    'ordinary-context.json',
    'apps/web/coverage/coverage-final.json',
    'apps/web/coverage/coverage-summary.json',
    'packages/shared-auth/coverage/coverage-summary.json',
    ...domainPackages.map(name => 'packages/' + name + '/coverage/coverage-summary.json'),
  ].sort();
}
export function normalizeOrdinaryCoverage({ bytes, candidateRoot, allowedSourceFiles }) {
  const coverage = parseUntrustedJSON(bytes);
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) fail('coverage object');
  const allowed = new Set(allowedSourceFiles),
    result = Object.create(null);
  for (const [file, row] of Object.entries(coverage)) {
    if (
      !relative(file) ||
      !file.startsWith('apps/web/src/') ||
      !/\.[cm]?[jt]sx?$/u.test(file) ||
      !allowed.has(file) ||
      !row ||
      row.path !== file
    )
      fail('foreign coverage path');
    const full = path.join(candidateRoot, file);
    if (fs.realpathSync(full) !== full || !fs.lstatSync(full).isFile())
      fail('source symlink/nonfile');
    validateOrdinaryGeometry(row);
    result[full] = { ...row, path: full };
  }
  return result;
}
export function validateSummary(bytes) {
  const value = parseUntrustedJSON(bytes, 16 * 1024 * 1024);
  const total = value?.total;
  for (const metric of ['lines', 'statements', 'functions', 'branches']) {
    const item = total?.[metric];
    if (
      !item ||
      ![item.total, item.covered, item.skipped].every(Number.isSafeInteger) ||
      item.total < 0 ||
      item.covered < 0 ||
      item.covered > item.total ||
      item.skipped < 0 ||
      typeof item.pct !== 'number' ||
      item.pct < 0 ||
      item.pct > 100
    )
      fail('coverage summary');
  }
  if (total.lines.total === 0) fail('empty required package coverage');
  return { total };
}
async function bounded(response, limit) {
  const chunks = [];
  let size = 0;
  for await (const part of response.body) {
    size += part.length;
    if (size > limit) {
      await response.body.cancel().catch(() => {});
      fail('HTTP body cap');
    }
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}
async function api(url, token) {
  if (!url.startsWith(API + '/')) fail('fixed API origin');
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2026-03-10',
    },
  });
  if (!response.ok) fail('GitHub API ' + response.status);
  return parseUntrustedJSON(await bounded(response, 2 * 1024 * 1024), 2 * 1024 * 1024);
}
// Invoked only by protected parent; metadata is read independently from GitHub,
// never taken on faith from an ordinary job's JSON manifest.
export async function fetchOrdinaryCoverageArtifact(options) {
  return fetchCoverageArtifact(options, false);
}
export async function fetchM4C0OrdinaryCoverageArtifact(options, authority) {
  consumeM4C0ArtifactAuthority(authority, options.context);
  return fetchCoverageArtifact(options, true);
}
async function fetchCoverageArtifact(
  { runId, attempt, context, outputDirectory, token = process.env.GITHUB_TOKEN },
  m4C0
) {
  if (typeof token !== 'string' || !token) fail('protected artifact read token absent');
  if (
    !SHA.test(context.candidateCommit) ||
    !Number.isSafeInteger(runId) ||
    !Number.isSafeInteger(attempt)
  )
    fail('context identity');
  const run = await api(API + '/actions/runs/' + runId + '/attempts/' + attempt, token);
  const jobs = await api(
    API + '/actions/runs/' + runId + '/attempts/' + attempt + '/jobs?per_page=100',
    token
  );
  const artifacts = await api(API + '/actions/runs/' + runId + '/artifacts?per_page=100', token);
  if (jobs.total_count > 100 || artifacts.total_count > 100) fail('bounded metadata pagination');
  const matchingJobs = jobs.jobs.filter(job => job.name === 'unit');
  const matchingArtifacts = artifacts.artifacts.filter(
    a => a.name === 'ordinary-coverage-' + attempt + '-' + context.candidateCommit
  );
  if (matchingJobs.length !== 1 || matchingArtifacts.length !== 1) fail('unique job/artifact');
  const artifact = matchingArtifacts[0];
  const identity = (m4C0 ? verifyM4C0UnitProvenance : verifyOrdinaryProvenance)({
    run,
    job: matchingJobs[0],
    artifact,
    context,
    runId,
    attempt,
  });
  const response = await fetch(API + '/actions/artifacts/' + artifact.id + '/zip', {
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2026-03-10',
    },
  });
  if (response.status !== 302) fail('artifact download redirect');
  const location = new URL(response.headers.get('location'));
  if (
    location.protocol !== 'https:' ||
    location.username ||
    location.password ||
    location.port ||
    !(
      location.hostname.endsWith('.blob.core.windows.net') ||
      location.hostname.endsWith('.actions.githubusercontent.com') ||
      location.hostname === 'objects.githubusercontent.com'
    )
  )
    fail('artifact download host');
  // Never forward the repository token to the signed object-store URL.
  const archiveResponse = await fetch(location, {
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  if (!archiveResponse.ok) fail('artifact download');
  const zip = await bounded(archiveResponse, 32 * 1024 * 1024);
  if ('sha256:' + sha(zip) !== identity.digest) fail('downloaded artifact digest');
  fs.mkdirSync(outputDirectory, { mode: 0o700 });
  const archive = path.join(outputDirectory, 'ordinary.zip');
  fs.writeFileSync(archive, zip, { flag: 'wx', mode: 0o600 });
  return {
    ...identity,
    archive,
    runId,
    attempt,
    context: structuredClone(context),
    ...(m4C0
      ? {
          qualificationPurpose: 'm4-c0',
          workflowStatus: run.status,
          workflowConclusion: run.status === 'completed' ? run.conclusion : null,
          workflowFailureNotDeliveryAccepted: true,
          productionCCredit: 0,
        }
      : {}),
    ordinaryCoverageIsUntrusted: true,
    nativeAdmission: false,
  };
}
export function unpackOrdinaryArtifact({ identity, expectedFiles, outputDirectory, producerRoot }) {
  const list = path.join(path.dirname(outputDirectory), 'expected-coverage-files.json');
  fs.writeFileSync(list, JSON.stringify(expectedFiles), { flag: 'wx', mode: 0o600 });
  execFileSync(
    '/usr/bin/python3',
    [
      '-B',
      path.join(producerRoot, 'scripts/ci/p2/unpack-ordinary.py'),
      identity.archive,
      list,
      outputDirectory,
    ],
    { env: { ...safeEnv, PYTHONDONTWRITEBYTECODE: '1' }, timeout: 30000, maxBuffer: 1024 }
  );
  const manifest = parseUntrustedJSON(
    fs.readFileSync(path.join(outputDirectory, 'ordinary-context.json')),
    65536
  );
  const context = identity.context;
  if (
    JSON.stringify(Object.keys(manifest).sort()) !==
      JSON.stringify(
        [
          'version',
          'repository',
          'eventName',
          'runId',
          'runAttempt',
          'candidateCommit',
          'candidateTree',
          'headCommit',
          'excludedSources',
          'coverageThresholdPendingProtectedMerge',
        ].sort()
      ) ||
    JSON.stringify(manifest.excludedSources) !==
      JSON.stringify(['apps/web/src/actions/admin-claims/assign.wrapper.test.ts']) ||
    manifest.coverageThresholdPendingProtectedMerge !== true ||
    manifest.version !== 1 ||
    manifest.repository !== context.repository ||
    manifest.eventName !== context.eventName ||
    manifest.runId !== identity.runId ||
    manifest.runAttempt !== identity.attempt ||
    manifest.candidateCommit !== context.candidateCommit ||
    manifest.candidateTree !== context.candidateTree ||
    manifest.headCommit !== context.headCommit
  )
    fail('ordinary manifest source/event binding');
  return outputDirectory;
}

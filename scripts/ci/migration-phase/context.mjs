import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { readObject } from './proof.mjs';

export const REPOSITORY = 'interdomestik/interdomestik';
export const HOSTS = {
  staging: 'staging.interdomestik.com',
  production: 'www.interdomestik.com',
};
const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[1-9]\d{0,19}$/u;
export const DEPLOY_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/u;
export const DEPLOY_ID = /^dpl_[a-zA-Z0-9]{1,64}$/u;

export function readContext(
  env = process.env,
  head = () => execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
) {
  const {
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: commitSha,
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: attempt,
    GITHUB_REF: ref,
    GITHUB_EVENT_NAME: event,
    RELEASE_ENVIRONMENT: environment,
  } = env;
  const main = ref === 'refs/heads/main' && ['push', 'workflow_dispatch'].includes(event);
  const tag = /^refs\/tags\/v[a-zA-Z0-9._-]*$/u.test(ref ?? '') && event === 'push';
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    repository !== REPOSITORY ||
    env.GITHUB_SERVER_URL !== 'https://github.com' ||
    env.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/.github/workflows/cd.yml@${ref}` ||
    !SHA.test(commitSha ?? '') ||
    env.GITHUB_WORKFLOW_SHA !== commitSha ||
    head() !== commitSha ||
    (!main && !tag) ||
    !Object.hasOwn(HOSTS, environment) ||
    !ID.test(runId ?? '') ||
    !ID.test(attempt ?? '')
  )
    throw new Error('RELEASE_CONTEXT_INVALID');
  return { repository, environment, commitSha, runId, attempt };
}

export function createManifest(context, imageDigest, plan) {
  if (typeof imageDigest !== 'string' || !DIGEST.test(imageDigest))
    throw new Error('ATTESTED_IMAGE_REQUIRED');
  const { attempt, ...origin } = context;
  return { version: 1, ...origin, imageDigest, plan };
}

export function readManifest(raw, context) {
  const manifest = readObject(raw, 'MANIFEST');
  if (
    manifest.version !== 1 ||
    !['repository', 'environment', 'commitSha', 'runId'].every(
      key => manifest[key] === context[key]
    ) ||
    typeof manifest.imageDigest !== 'string' ||
    !DIGEST.test(manifest.imageDigest) ||
    manifest.plan === null ||
    typeof manifest.plan !== 'object' ||
    Array.isArray(manifest.plan)
  )
    throw new Error('MANIFEST_CONTEXT_MISMATCH');
  return manifest;
}

export function readRelease(raw, context) {
  const release = readObject(raw, 'DEPLOYMENT');
  readManifest(JSON.stringify(release.manifest), context);
  if (
    typeof release.deploymentAttempt !== 'string' ||
    !ID.test(release.deploymentAttempt) ||
    BigInt(release.deploymentAttempt) > BigInt(context.attempt) ||
    typeof release.deploymentId !== 'string' ||
    !DEPLOY_ID.test(release.deploymentId) ||
    typeof release.hostname !== 'string' ||
    !DEPLOY_HOST.test(release.hostname) ||
    typeof release.vercelOutputDigest !== 'string' ||
    !DIGEST.test(release.vercelOutputDigest)
  )
    throw new Error('DEPLOYMENT_CONTEXT_MISMATCH');
  return release;
}

export function output(name, value) {
  if (typeof value !== 'string' || /[\r\n]/u.test(value)) throw new Error('RELEASE_OUTPUT_INVALID');
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

export function writeEvidence(value) {
  writeFileSync(process.env.RELEASE_PHASE_EVIDENCE, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
}

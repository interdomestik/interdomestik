import { createHmac, timingSafeEqual } from 'node:crypto';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const PASS = new Set(['pass', 'ok']);
const EXECUTOR = 'z620-linux-amd64';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stable(value[key])])
  );
}

function signature(payload, key) {
  return createHmac('sha256', key)
    .update(JSON.stringify(stable(payload)))
    .digest('hex');
}

export function permitProblems(input) {
  const problems = [];
  if (!SHA_PATTERN.test(input.sha ?? '')) problems.push('invalid_sha');
  if (input.executor !== EXECUTOR) problems.push('invalid_executor');
  if (!input.clean) problems.push('dirty_candidate');
  if (!PASS.has(String(input.parityStatus).toLowerCase())) problems.push('parity_not_green');
  if (!input.checksumsValid) problems.push('invalid_checksums');
  if (!input.health?.postgres || !input.health?.supabase) problems.push('unhealthy_services');

  for (const result of input.requiredResults ?? []) {
    if (result.required !== false && !PASS.has(String(result.status).toLowerCase())) {
      problems.push(`required_result:${result.id}`);
    }
  }
  for (const [provider, status] of Object.entries(input.providers ?? {})) {
    if (!PASS.has(String(status).toLowerCase())) problems.push(`provider:${provider}`);
  }
  return problems;
}

export function issuePermit(input, { key, now = Date.now(), ttlMs = 30 * 60_000 } = {}) {
  if (!key) throw new Error('Z620 permit signing key is required.');
  const problems = permitProblems(input);
  if (problems.length) throw new Error(`Push permit denied: ${problems.join(', ')}`);
  const payload = {
    version: 2,
    sha: input.sha,
    branch: input.branch,
    executor: EXECUTOR,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    automaticPush: false,
  };
  return { ...payload, signature: signature(payload, key) };
}

export function verifyPermit(permit, { key, currentSha, now = Date.now() } = {}) {
  if (!key || !/^[0-9a-f]{64}$/u.test(String(permit?.signature ?? ''))) return false;
  if (
    permit.executor !== EXECUTOR ||
    permit.sha !== currentSha ||
    Date.parse(permit.expiresAt) <= now
  ) {
    return false;
  }
  const { signature: received, ...payload } = permit;
  const expected = signature(payload, key);
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { fetchVercelAttestation } from '../fetch-vercel-attestation.mjs';
import { evaluateObservation } from './evaluate.mjs';
import { readExpectedLedger } from './journal.mjs';
import { buildReceipt } from './receipt.mjs';
import { STAGING_EXPECTATION } from './staging-expectation.mjs';

// U2-e collector: signs in as the dedicated staging observer on the immutable deployment, asks the
// deployed app to observe its own tenant client, verifies the answer and writes a secret-free
// receipt. Every request and response body is bounded in time and size, so a receipt is always
// written. In `enforce` mode only PASS exits 0; in `observe` mode a written receipt exits 0 and a
// non-PASS status is surfaced as a warning. Credentials and cookies never reach the receipt or log.

const HOST = /^[\da-z][\d.a-z-]*\.vercel\.app$/u;
const SHA = /^[\da-f]{40}$/u;
const DIGEST = /^sha256:[\da-f]{64}$/u;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const KNOWN_REFUSALS = new Set([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'INVALID_CHALLENGE',
  'BODY_TOO_LARGE',
  'OBSERVATION_FAILED',
  'OBSERVATION_TIMEOUT',
]);

class CollectionFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const fail = code => {
  throw new CollectionFailure(code);
};

/** Rejects once `signal` aborts, so a body that stops sending still ends at the deadline. */
function abortion(signal) {
  return new Promise((_resolve, reject) => {
    const stop = () => reject(new Error('aborted'));
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
  });
}

/** Reads at most MAX_RESPONSE_BYTES of a body before `signal` aborts; otherwise refuses with `code`. */
async function readLimited(response, code, signal) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const stopped = abortion(signal);
  stopped.catch(() => {});
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) fail(code);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** A fetch whose every response body is read under one deadline and size cap, then replayed. */
function boundedFetch(fetchImpl, signal, code) {
  return async (url, init = {}) => {
    const response = await Promise.race([fetchImpl(url, { ...init, signal }), abortion(signal)]);
    const text = await readLimited(response, code, signal);
    const empty = [101, 204, 205, 304].includes(response.status);
    return new Response(empty ? null : text, {
      status: response.status,
      headers: response.headers,
    });
  };
}

/** One request whose headers and body share a single deadline; transport failures become `code`. */
async function request({ fetchImpl, url, init, timeoutMs, code, readBody }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await Promise.race([
      fetchImpl(url, { ...init, signal: controller.signal }),
      abortion(controller.signal),
    ]);
    const body = readBody ? await readLimited(response, code, controller.signal) : null;
    if (!readBody) await response.body?.cancel().catch(() => {});
    return { response, body };
  } catch (error) {
    if (error instanceof CollectionFailure) throw error;
    return fail(code);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The immutable deployment's release identity, bound to the expected commit. The shared helper
 * keeps its host and redirect rules; every response it reads is bounded here by one deadline.
 */
async function readDeployment({ hostname, expectedSha, bypassSecret, fetchImpl, timeoutMs }) {
  const code = 'DEPLOYMENT_METADATA_UNAVAILABLE';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let metadata;
  try {
    const text = await Promise.race([
      fetchVercelAttestation({
        metadataUrl: `https://${hostname}/.well-known/interdomestik-release-attestation.json`,
        expectedHost: hostname,
        bypassSecret,
        fetchImpl: boundedFetch(fetchImpl, controller.signal, code),
        timeoutMs,
      }),
      abortion(controller.signal),
    ]);
    metadata = JSON.parse(text);
  } catch {
    fail(code);
  } finally {
    clearTimeout(timer);
  }
  const valid =
    metadata?.environment === 'staging' &&
    SHA.test(metadata.commitSha ?? '') &&
    DIGEST.test(metadata.sourceImageDigest ?? '') &&
    DIGEST.test(metadata.vercelOutputDigest ?? '');
  if (!valid) fail('DEPLOYMENT_METADATA_INVALID');
  if (metadata.commitSha !== expectedSha) fail('DEPLOYMENT_COMMIT_MISMATCH');
  return {
    environment: 'staging',
    hostname,
    commitSha: metadata.commitSha,
    sourceImageDigest: metadata.sourceImageDigest,
    vercelOutputDigest: metadata.vercelOutputDigest,
  };
}

function cookieHeader(response) {
  const cookies = (response.headers.getSetCookie?.() ?? [])
    .map(entry => entry.split(';')[0].trim())
    .filter(pair => /^[\w.-]+=[^;\s]*$/u.test(pair));
  return cookies.length > 0 ? cookies.join('; ') : null;
}

async function signIn({ origin, canonicalOrigin, credentials, headers, fetchImpl, timeoutMs }) {
  const { response } = await request({
    fetchImpl,
    timeoutMs,
    code: 'SIGN_IN_TRANSPORT',
    readBody: false,
    url: `${origin}/api/auth/sign-in/email`,
    init: {
      method: 'POST',
      redirect: 'manual',
      headers: {
        ...headers,
        'content-type': 'application/json',
        Origin: canonicalOrigin,
        Referer: `${canonicalOrigin}/en/login`,
      },
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    },
  });
  const cookie = response.status === 200 ? cookieHeader(response) : null;
  return cookie ?? fail('SIGN_IN_FAILED');
}

async function observe({ origin, cookie, challenge, headers, fetchImpl, timeoutMs }) {
  const { response, body: raw } = await request({
    fetchImpl,
    timeoutMs,
    code: 'OBSERVATION_TRANSPORT',
    readBody: true,
    url: `${origin}/api/health`,
    init: {
      method: 'POST',
      redirect: 'manual',
      headers: { ...headers, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ challenge }),
    },
  });
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  if (response.status === 200) return body;
  const refusal = typeof body?.error === 'string' ? body.error : '';
  return fail(KNOWN_REFUSALS.has(refusal) ? `OBSERVATION_${refusal}` : 'OBSERVATION_REFUSED');
}

/** Runs one collection. Every input is explicit so tests can drive it without a network. */
export async function collect(input) {
  const {
    root,
    mode,
    hostname,
    canonicalHost,
    expectedSha,
    credentials,
    fetchImpl = fetch,
    requestTimeoutMs: timeoutMs = REQUEST_TIMEOUT_MS,
  } = input;
  const expectation = input.expectation ?? STAGING_EXPECTATION;
  const { journalSha256, entries } = readExpectedLedger(root);
  const challenge = (input.randomBytesImpl ?? randomBytes)(32).toString('base64url');
  const context = {
    expectationSha256: createHash('sha256').update(JSON.stringify(expectation)).digest('hex'),
    journalSha256,
    expectedLedgerCount: entries.length,
    challenge,
    collectedAt: (input.now ?? (() => new Date()))().toISOString(),
    runId: input.runId ?? null,
    runAttempt: input.runAttempt ?? null,
    deployment: null,
  };
  const receipt = (failureCodes, observation = null) =>
    buildReceipt({ mode, failureCodes, context, observation });

  if (!HOST.test(hostname ?? '') || !SHA.test(expectedSha ?? ''))
    return receipt(['COLLECTOR_INPUT_INVALID']);
  if (!credentials?.email || !credentials?.password)
    return receipt(['OBSERVER_ACCOUNT_UNPROVISIONED']);
  const headers = input.bypassSecret ? { 'x-vercel-protection-bypass': input.bypassSecret } : {};
  const origin = `https://${hostname}`;
  try {
    context.deployment = await readDeployment({
      hostname,
      expectedSha,
      bypassSecret: input.bypassSecret,
      fetchImpl,
      timeoutMs,
    });
    const canonicalOrigin = `https://${canonicalHost}`;
    const io = { origin, headers, fetchImpl, timeoutMs };
    const cookie = await signIn({ ...io, canonicalOrigin, credentials });
    const observation = await observe({ ...io, cookie, challenge });
    const { failureCodes } = evaluateObservation(observation, {
      expectation,
      journal: entries,
      request: { challenge, commitSha: expectedSha },
    });
    return receipt(failureCodes, observation);
  } catch (error) {
    if (error instanceof CollectionFailure) return receipt([error.code]);
    return receipt(['COLLECTOR_ERROR']);
  }
}

/** `enforce`: only PASS exits 0. `observe`: a written receipt exits 0 whatever its status. */
export function exitCodeFor(receipt) {
  return receipt.mode === 'observe' || receipt.status === 'PASS' ? 0 : 1;
}

async function main() {
  const env = process.env;
  const receipt = await collect({
    root: process.cwd(),
    mode: env.RUNTIME_ATTESTATION_MODE,
    hostname: env.RUNTIME_ATTESTATION_HOSTNAME,
    canonicalHost: env.RUNTIME_ATTESTATION_CANONICAL_HOST,
    expectedSha: env.EXPECTED_COMMIT_SHA,
    bypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET,
    credentials: {
      email: env.RUNTIME_ATTESTATION_OBSERVER_EMAIL,
      password: env.RUNTIME_ATTESTATION_OBSERVER_PASSWORD,
    },
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
  });
  const out = env.RUNTIME_ATTESTATION_RECEIPT_PATH;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  const summary = `U2-e runtime attestation (${receipt.mode}): ${receipt.status} ${receipt.failureCodes.join(',')}`;
  console.log(receipt.status === 'PASS' ? summary : `::warning::${summary}`);
  process.exitCode = exitCodeFor(receipt);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();

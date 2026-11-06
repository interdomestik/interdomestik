#!/usr/bin/env node
// U2-e staging enrolment runner (workflow staging-runtime-attestation-enrol.yml only). Refuses
// before connecting unless the dispatch context and the reviewed staging authority hold, then
// verifies both identities, runs the enrolment and the restricted readback, and writes one sanitized
// receipt. Fixed codes only: no URL, credential, option or driver text is ever printed or written.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { ENROL_OPERATION, EnrolError, enrolStaging, readBack, sha256 } from './enrol-core.mjs';
import { STAGING_AUTHORITY } from './staging-authority.mjs';
import { STAGING_EXPECTATION } from './staging-expectation.mjs';

const REPOSITORY = 'interdomestik/interdomestik';
const APPLICATION = 'ida_u2e_staging_enrol_v1';
const AUTHORITY_FIELDS = [
  'host',
  'port',
  'database',
  'adminUser',
  'adminRole',
  'runtimeUser',
  'caPem',
];
const RUN_ID = /^[1-9][0-9]{0,19}$/u;

const refuse = code => {
  throw new EnrolError(code);
};

export function assertDispatchContext(env, headSha) {
  if (env.GITHUB_ACTIONS !== 'true') refuse('NOT_GITHUB_ACTIONS');
  if (env.GITHUB_REPOSITORY !== REPOSITORY) refuse('REPOSITORY_REJECTED');
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch') refuse('EVENT_REJECTED');
  if (env.GITHUB_REF !== 'refs/heads/main') refuse('REF_REJECTED');
  if (!/^[0-9a-f]{40}$/u.test(env.GITHUB_SHA ?? '') || env.GITHUB_SHA !== headSha)
    refuse('CHECKOUT_SHA_MISMATCH');
  if (!RUN_ID.test(env.GITHUB_RUN_ID ?? '') || !RUN_ID.test(env.GITHUB_RUN_ATTEMPT ?? ''))
    refuse('RUN_ID_INVALID');
}

export function assertAuthorityReviewed(authority) {
  if (authority.reviewed !== true) refuse('STAGING_AUTHORITY_UNREVIEWED');
  for (const field of AUTHORITY_FIELDS)
    if (authority[field] === null || authority[field] === undefined || authority[field] === '')
      refuse('STAGING_AUTHORITY_INCOMPLETE');
  if (!/^[a-z]{20}$/u.test(authority.projectRef)) refuse('STAGING_AUTHORITY_INCOMPLETE');
  if (!/^[A-Za-z0-9]{8,64}$/u.test(authority.identityProbeUserId ?? ''))
    refuse('STAGING_AUTHORITY_INCOMPLETE');
  if (!authority.caPem.includes('-----BEGIN CERTIFICATE-----'))
    refuse('STAGING_AUTHORITY_INCOMPLETE');
  if (authority.runtimeUser.split('.')[0] !== STAGING_EXPECTATION.loginRole)
    refuse('STAGING_AUTHORITY_ROLE_MISMATCH');
}

/** Strictly parses one secret URL against the reviewed authority; nothing in the URL can override it. */
export function parseTarget(text, authority, kind) {
  let url;
  try {
    url = new URL(text ?? '');
  } catch {
    refuse(`${kind}_URL_INVALID`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') refuse(`${kind}_URL_INVALID`);
  if (url.hash || url.hostname.includes(',')) refuse(`${kind}_URL_INVALID`);
  for (const [key, value] of url.searchParams)
    if (key !== 'sslmode' || !['require', 'verify-full'].includes(value))
      refuse(`${kind}_URL_OPTION_REJECTED`);
  const user = decodeURIComponent(url.username);
  const expectedUser = kind === 'ADMIN' ? authority.adminUser : authority.runtimeUser;
  if (url.hostname !== authority.host) refuse(`${kind}_HOST_REJECTED`);
  if (Number(url.port || 5432) !== authority.port) refuse(`${kind}_PORT_REJECTED`);
  if (decodeURIComponent(url.pathname.slice(1)) !== authority.database)
    refuse(`${kind}_DATABASE_REJECTED`);
  if (user !== expectedUser) refuse(`${kind}_USER_REJECTED`);
  if (!url.password) refuse(`${kind}_PASSWORD_MISSING`);
  return { username: user, password: decodeURIComponent(url.password) };
}

const SAFE_HOST = /^[a-z0-9.-]{1,253}$/u;
const SAFE_NAME = /^[a-z_][a-z0-9_.]{0,127}$/u;
const SSL_MODES = new Set(['require', 'verify-full']);
const safe = (value, pattern) => (pattern.test(value) ? value : 'unrecognized');
const sslModeFact = mode => {
  if (mode === null) return null;
  return SSL_MODES.has(mode) ? mode : 'unrecognized';
};

/**
 * Non-secret connection facts of one URL, recorded while the authority is not yet reviewed so the
 * descriptor can be prepared. They are candidates, never self-approving. Only allowlisted shapes are
 * copied; anything else becomes a fixed indicator, so no URL content outside them (a password, a
 * parameter name or value) can reach the uploaded receipt.
 */
export function describeTarget(text) {
  try {
    const url = new URL(text ?? '');
    const params = [...url.searchParams];
    return {
      valid: url.protocol === 'postgres:' || url.protocol === 'postgresql:',
      host: safe(url.hostname, SAFE_HOST),
      port: /^\d{1,5}$/u.test(url.port || '5432') ? Number(url.port || 5432) : 'unrecognized',
      database: safe(decodeURIComponent(url.pathname.slice(1)), SAFE_NAME),
      username: safe(decodeURIComponent(url.username), SAFE_NAME),
      passwordPresent: url.password.length > 0,
      sslmode: sslModeFact(url.searchParams.get('sslmode')),
      otherParameters: params.filter(([key]) => key !== 'sslmode').length,
    };
  } catch {
    return { valid: false };
  }
}

export function connectionOptions(target, authority) {
  return {
    host: authority.host,
    port: authority.port,
    database: authority.database,
    username: target.username,
    password: target.password,
    ssl: { ca: authority.caPem, servername: authority.host, rejectUnauthorized: true },
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 5,
    onnotice: () => {},
    connection: { application_name: APPLICATION },
  };
}

async function verifyAdmin(admin, authority) {
  const [row] = await admin`
    SELECT session_user::text AS "session", current_user::text AS "current",
      current_database()::text AS database, current_setting('server_version_num')::int AS version,
      (SELECT count(*) FROM public."user" WHERE id = ${authority.identityProbeUserId})::int AS probe`;
  if (row.session !== authority.adminRole || row.current !== authority.adminRole)
    refuse('ADMIN_IDENTITY_MISMATCH');
  if (row.database !== authority.database) refuse('ADMIN_DATABASE_MISMATCH');
  if (row.probe !== 1) refuse('STAGING_IDENTITY_PROBE_FAILED');
  return row.version;
}

async function verifyRuntime(restricted) {
  const [row] =
    await restricted`SELECT session_user::text AS "session", current_user::text AS "current"`;
  const role = STAGING_EXPECTATION.loginRole;
  if (row.session !== role || row.current !== role) refuse('RUNTIME_IDENTITY_MISMATCH');
}

const digest = value => sha256(JSON.stringify(value));

export async function run({ env, headSha, connect = options => postgres(options) }) {
  const receipt = {
    schemaVersion: 'ida.u2e-staging-enrol-receipt.v1',
    operation: ENROL_OPERATION,
    sourceSha: headSha,
    runId: env.GITHUB_RUN_ID ?? null,
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
    authoritySha256: digest(STAGING_AUTHORITY),
    expectationSha256: digest(STAGING_EXPECTATION),
    projectRef: STAGING_AUTHORITY.projectRef,
    database: STAGING_AUTHORITY.database,
    adminRole: STAGING_AUTHORITY.adminRole,
    runtimeRole: STAGING_EXPECTATION.loginRole,
    serverVersionNum: null,
    transaction: 'not_started',
    path: null,
    readback: 'not_run',
    code: null,
    privileges: null,
    markerSha256: null,
    ledgerCount: null,
    ledgerSha256: null,
  };
  const clients = [];
  try {
    assertDispatchContext(env, headSha);
    if (STAGING_AUTHORITY.reviewed !== true)
      receipt.candidate = {
        admin: describeTarget(env.DATABASE_URL),
        runtime: describeTarget(env.DATABASE_URL_RLS),
      };
    assertAuthorityReviewed(STAGING_AUTHORITY);
    const adminTarget = parseTarget(env.DATABASE_URL, STAGING_AUTHORITY, 'ADMIN');
    const runtimeTarget = parseTarget(env.DATABASE_URL_RLS, STAGING_AUTHORITY, 'RUNTIME');
    const admin = connect(connectionOptions(adminTarget, STAGING_AUTHORITY));
    clients.push(admin);
    const restricted = connect(connectionOptions(runtimeTarget, STAGING_AUTHORITY));
    clients.push(restricted);
    receipt.serverVersionNum = await verifyAdmin(admin, STAGING_AUTHORITY);
    await verifyRuntime(restricted);
    const inputs = {
      role: STAGING_EXPECTATION.loginRole,
      marker: STAGING_EXPECTATION.backendMarker,
    };
    const enrolled = await enrolStaging(admin, inputs);
    Object.assign(receipt, {
      transaction: enrolled.transaction,
      code: enrolled.code,
      path: enrolled.path ?? null,
      privileges: enrolled.privileges ?? null,
      markerSha256: enrolled.markerSha256 ?? null,
    });
    if (enrolled.transaction === 'committed') {
      const read = await readBack(restricted, inputs);
      Object.assign(receipt, { readback: read.readback, code: read.code });
      if (read.readback === 'ok')
        Object.assign(receipt, { ledgerCount: read.ledgerCount, ledgerSha256: read.ledgerSha256 });
    }
  } catch (error) {
    receipt.code = error instanceof EnrolError ? error.code : 'RUNNER_ERROR';
  } finally {
    await Promise.allSettled(clients.map(client => client.end({ timeout: 5 })));
  }
  receipt.ok = receipt.transaction === 'committed' && receipt.readback === 'ok';
  return receipt;
}

export function receiptPath(root, env) {
  if (!RUN_ID.test(env.GITHUB_RUN_ID ?? '') || !RUN_ID.test(env.GITHUB_RUN_ATTEMPT ?? ''))
    return path.join(root, 'tmp/runtime-attestation-enrol/invalid-run/receipt.json');
  const dir = `${Number(env.GITHUB_RUN_ID)}-${Number(env.GITHUB_RUN_ATTEMPT)}`;
  return path.join(root, 'tmp/runtime-attestation-enrol', dir, 'receipt.json');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const receipt = await run({ env: process.env, headSha });
  const out = receiptPath(root, process.env);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    `enrolment: transaction=${receipt.transaction} readback=${receipt.readback} code=${receipt.code}`
  );
  process.exitCode = receipt.ok ? 0 : 1;
}

// This entry point is loaded with tsx by the two kinds of protected CD migration job.
import path from 'node:path';
import { withPreflightedAdminConnection } from '../../../packages/database/src/admin-connection-preflight.ts';
import {
  readReleaseJournal,
  runReleaseMigrations,
} from '../../../packages/database/src/release-migrations.ts';
import { STAGING_EXPECTATION } from '../runtime-attestation/staging-expectation.mjs';
import { createManifest, output, readContext, readRelease, writeEvidence } from './context.mjs';
import { verifyDeployment } from './deployment.mjs';
import { digest, verifyDrainReceipt, verifyGitHubApproval } from './proof.mjs';

const env = process.env;
const evidence = { version: 1, status: 'refused' };
const SAFE_CODES = new Set([
  'RELEASE_CONTEXT_INVALID',
  'MODE_INVALID',
  'MANIFEST_PLAN_MISMATCH',
  'BACKEND_MISMATCH',
  'LEDGER_DIVERGENT',
  'LEDGER_WRITE_MISMATCH',
  'EXPAND_PREFIX_MISMATCH',
  'INTERMEDIATE_RELEASE_REQUIRED',
  'MIGRATION_CONNECTION_INVALID',
  'RELEASE_TRANSACTION_OUTCOME_UNKNOWN',
  'ADMIN_DB_PREFLIGHT_CONFIG_REJECTED',
  'ADMIN_DB_PREFLIGHT_AUTHORITY_REJECTED',
  'ADMIN_DB_PREFLIGHT_CONNECT_FAILED',
  'ADMIN_DB_PREFLIGHT_IDENTITY_REJECTED',
  'ADMIN_DB_PREFLIGHT_ROLE_REJECTED',
  'ADMIN_DB_PREFLIGHT_STATE_REJECTED',
  'ADMIN_DB_PREFLIGHT_TRANSPORT_REJECTED',
  'ADMIN_DB_PREFLIGHT_VERSION_REJECTED',
  'ADMIN_DB_PREFLIGHT_CLEANUP_FAILED',
  'ADMIN_DB_PREFLIGHT_ABORTED',
  'MIGRATION_TRANSACTION_CONTROL',
  'MIGRATION_SQL_INVALID',
  'REGISTRY_INVALID',
  'REGISTRY_TAG_INVALID',
  'REGISTRY_POSITIONS_INVALID',
  'DORMANT_PAIR_HAS_SQL',
  'REGISTERED_PAIR_MISMATCH',
  'UNREGISTERED_PHASE',
  'JOURNAL_INVALID',
  'JOURNAL_ENTRY_INVALID',
  'ATTESTED_IMAGE_REQUIRED',
  'MIGRATION_AUTHORITY_MISSING',
  'MANIFEST_CONTEXT_MISMATCH',
  'MANIFEST_MISSING_OR_SIZE',
  'DEPLOYMENT_MISSING_OR_SIZE',
  'DEPLOYMENT_CONTEXT_MISMATCH',
  'CANONICAL_ALIAS_MISMATCH',
  'IMMUTABLE_DEPLOYMENT_MISMATCH',
  'DEPLOYMENT_ATTESTATION_MISMATCH',
  'DEPLOYMENT_AUTHORITY_MISSING',
  'DEPLOYMENT_PROVIDER_REFUSED',
  'DEPLOYMENT_IDENTITY_INVALID',
  'RECEIPT_MISSING_OR_SIZE',
  'RECEIPT_JSON_INVALID',
  'RECEIPT_SHAPE_INVALID',
  'RECEIPT_RELEASE_OR_INVOCATION_MISMATCH',
  'RECEIPT_DRAIN_INVALID',
  'RECEIPT_WRITER_INVENTORY_INVALID',
  'RECEIPT_TIMESTAMP_INVALID',
  'RECEIPT_EXPIRED_OR_NOT_YET_VALID',
  'RECEIPT_EXPIRED',
  'REVIEW_AUTHORITY_INVALID',
  'REVIEW_HISTORY_INVALID',
  'RECEIPT_APPROVAL_MISSING',
  'REVIEW_ACTOR_INVALID',
  'REVIEW_HISTORY_UNAVAILABLE',
]);

async function approvalHistory(context) {
  if (!env.GITHUB_TOKEN) throw new Error('REVIEW_HISTORY_UNAVAILABLE');
  const response = await fetch(
    `https://api.github.com/repos/${context.repository}/actions/runs/${context.runId}/approvals`,
    {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    }
  );
  if (!response.ok) throw new Error('REVIEW_HISTORY_UNAVAILABLE');
  return response.json();
}

async function main() {
  const context = readContext();
  const mode = process.argv[2];
  if (!['expand', 'contract'].includes(mode) || process.argv.length !== 3)
    throw new Error('MODE_INVALID');
  const protectedEnvironment = `${context.environment}-migration-${mode}`;
  const imageDigest = env.RELEASE_IMAGE_DIGEST;
  const backend = env.RELEASE_BACKEND_MARKER;
  if (
    env.RELEASE_PROTECTED_ENVIRONMENT !== protectedEnvironment ||
    !/^ida\.(?:staging|production)\.backend-marker\.v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      backend ?? ''
    ) ||
    !backend.startsWith(`ida.${context.environment}.`) ||
    (context.environment === 'staging' && backend !== STAGING_EXPECTATION.backendMarker)
  )
    throw new Error('MIGRATION_AUTHORITY_MISSING');
  const journal = readReleaseJournal(path.resolve('packages/database/drizzle'));
  const backendMarkerSha256 = digest(backend);
  const release = mode === 'contract' ? readRelease(env.RELEASE_DEPLOYMENT, context) : null;
  if (mode === 'expand') createManifest(context, imageDigest, null);
  evidence.context = context;
  evidence.mode = mode;
  evidence.release = release;
  if (release) {
    evidence.manifestSha256 = digest(JSON.stringify(release.manifest));
    if (env.RELEASE_DRAIN_RECEIPT && Buffer.byteLength(env.RELEASE_DRAIN_RECEIPT) <= 16_384)
      evidence.receiptSha256 = digest(env.RELEASE_DRAIN_RECEIPT);
    // Read-only recovery also requires that this exact deployment still holds the alias.
    await verifyDeployment(release);
  }
  const authorize = async () => {
    const invocation = {
      environment: protectedEnvironment,
      runId: context.runId,
      attempt: context.attempt,
    };
    const binding = { release, manifestSha256: evidence.manifestSha256, invocation };
    const receipt = verifyDrainReceipt(env.RELEASE_DRAIN_RECEIPT, binding);
    const operator = verifyGitHubApproval(await approvalHistory(context), {
      environment: protectedEnvironment,
      reviewerIds: env.RELEASE_DRAIN_REVIEWER_IDS,
      receiptSha256: receipt.receiptSha256,
    });
    evidence.approval = { ...operator, invocation, ...receipt };
    // Re-read the alias and immutable build under the ledger lock, then recheck expiry.
    await verifyDeployment(release);
    return verifyDrainReceipt(env.RELEASE_DRAIN_RECEIPT, binding).expiresAt;
  };

  const ca = env.RELEASE_DATABASE_CA_BASE64;
  const host = env.RELEASE_DATABASE_HOST;
  const bypassesRls = env.RELEASE_DATABASE_ROLE_BYPASSES_RLS;
  if (
    !/^db\.[a-z0-9]{20}\.supabase\.co$/u.test(host ?? '') ||
    !ca ||
    !['true', 'false'].includes(bypassesRls) ||
    !env.RELEASE_MIGRATION_URL
  )
    throw new Error('MIGRATION_CONNECTION_INVALID');

  // The preflight owns the connection and checks the direct TLS endpoint and owner role,
  // while the phase runner checks the enrolled database and ledger under the lock.
  const authority = {
    environmentClass: 'supabase_direct',
    endpointSha256: digest(`${host}:5432`),
    caSha256: digest(Buffer.from(ca, 'base64')),
    expectedRolsuper: false,
    expectedRolbypassrls: bypassesRls === 'true',
  };
  const signal = AbortSignal.timeout(12 * 60_000);
  let result;
  let refused;
  const verified = await withPreflightedAdminConnection(
    { DATABASE_URL: env.RELEASE_MIGRATION_URL, DATABASE_ADMIN_CA_PEM_BASE64: ca },
    Date.now(),
    signal,
    { ...authority, receiptSha256: digest(JSON.stringify(authority)) },
    async reserved => {
      const request = release ? { mode, plan: release.manifest.plan, authorize } : { mode };
      try {
        result = await runReleaseMigrations(reserved, journal, backendMarkerSha256, request);
      } catch (error) {
        refused = error;
        throw error;
      }
    }
  );
  if (!verified.ok) throw refused ?? new Error(verified.error.code);
  if (!result) throw new Error('MIGRATION_PHASE_FAILED');
  evidence.status = result.status;
  if (mode === 'expand') {
    const manifest = createManifest(context, imageDigest, result.plan);
    evidence.manifest = manifest;
    evidence.manifestSha256 = digest(JSON.stringify(manifest));
    output('manifest', JSON.stringify(manifest));
    output('contract_required', String(Boolean(result.plan.contract)));
    output('attempt', context.attempt);
  }
}

try {
  await main();
} catch (error) {
  evidence.status = 'refused';
  evidence.code = SAFE_CODES.has(error?.message) ? error.message : 'MIGRATION_PHASE_FAILED';
  process.stderr.write(`${evidence.code}\n`);
  process.exitCode = 1;
} finally {
  writeEvidence(evidence);
}

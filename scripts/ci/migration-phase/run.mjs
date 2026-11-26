// Run with tsx from the independently reviewed owner checkout.
import { fileURLToPath } from 'node:url';
import { withPreflightedAdminConnection } from '../../../packages/database/src/admin-connection-preflight.ts';
import { assertDisposableUrl } from '../../../packages/database/src/disposable-client.ts';
import {
  readReleaseJournal,
  runReleaseMigrations,
} from '../../../packages/database/src/release-migrations.ts';
import { verifyDeployment } from './deployment.mjs';
import {
  COMMIT,
  HEX,
  ID,
  digest,
  matches,
  object,
  readBytes,
  readObject,
  verificationKey,
  verifyDrainReceipt,
} from './proof.mjs';

const POLICY = fileURLToPath(
  new URL('../../../packages/database/drizzle/contract-phases.json', import.meta.url)
);
const SAFE_CODES = new Set([
  'RELEASE_USAGE_INVALID',
  'OWNER_CONFIG_INVALID',
  'CONFIG_MISSING_OR_SIZE',
  'CONFIG_JSON_INVALID',
  'CONFIG_SHAPE_INVALID',
  'CANDIDATE_PIN_MISMATCH',
  'MANIFEST_MISSING_OR_SIZE',
  'MANIFEST_JSON_INVALID',
  'MANIFEST_SHAPE_INVALID',
  'MANIFEST_PLAN_MISMATCH',
  'KEY_MISSING_OR_SIZE',
  'KEY_PIN_MISMATCH',
  'RECEIPT_MISSING_OR_SIZE',
  'RECEIPT_JSON_INVALID',
  'RECEIPT_SHAPE_INVALID',
  'RECEIPT_SIGNATURE_INVALID',
  'RECEIPT_BINDING_MISMATCH',
  'RECEIPT_DEPLOYMENT_INVALID',
  'RECEIPT_DRAIN_INVALID',
  'RECEIPT_EXPIRED',
  'RECEIPT_REPLAYED',
  'ATTEMPT_INVALID',
  'BACKEND_MISMATCH',
  'BACKEND_CATALOG_REJECTED',
  'ATTEMPT_CATALOG_REJECTED',
  'LEDGER_DIVERGENT',
  'LEDGER_WRITE_MISMATCH',
  'EXPAND_PREFIX_MISMATCH',
  'RECOVERY_AT_EXPAND',
  'RECOVERY_LEDGER_MISMATCH',
  'RELEASE_TRANSACTION_OUTCOME_UNKNOWN',
  'MIGRATION_TRANSACTION_CONTROL',
  'MIGRATION_REPLICATION_MODE_REJECTED',
  'MIGRATION_SQL_INVALID',
  'MIGRATION_SQL_FAILED',
  'MIGRATION_SESSION_CONTROL',
  'REGISTRY_INVALID',
  'REGISTRY_TAG_INVALID',
  'REGISTRY_POSITIONS_INVALID',
  'DORMANT_PAIR_HAS_SQL',
  'REGISTERED_PAIR_MISMATCH',
  'REGISTERED_PHASE_SQL_MISMATCH',
  'UNREGISTERED_PHASE',
  'JOURNAL_INVALID',
  'JOURNAL_ENTRY_INVALID',
  'JOURNAL_SQL_INVALID',
  'JOURNAL_INPUT_UNAVAILABLE',
  'PHASE_SCHEMA_DIVERGENT',
  'PHASE_SHAPE_POLICY_MISSING',
  'PREPARED_TRANSACTIONS_PRESENT',
  'CANONICAL_ALIAS_MISMATCH',
  'IMMUTABLE_DEPLOYMENT_MISMATCH',
  'DEPLOYMENT_ATTESTATION_MISMATCH',
  'DEPLOYMENT_AUTHORITY_MISSING',
  'DEPLOYMENT_PROVIDER_REFUSED',
  'MIGRATION_EXECUTION_PUBLIC_SCHEMA_REJECTED',
  'MIGRATION_EXECUTION_BOOTSTRAP_FAILED',
  'MIGRATION_LEDGER_OWNER_REJECTED',
  'MIGRATION_LEDGER_ACL_REJECTED',
  'MIGRATION_LEDGER_SHAPE_REJECTED',
  'MIGRATION_LEDGER_CATALOG_REJECTED',
  'ADMIN_DB_PREFLIGHT_CONFIG_REJECTED',
  'ADMIN_DB_PREFLIGHT_AUTHORITY_REJECTED',
  'ADMIN_DB_PREFLIGHT_CONNECT_FAILED',
  'ADMIN_DB_PREFLIGHT_IDENTITY_REJECTED',
  'ADMIN_DB_PREFLIGHT_ROLE_REJECTED',
  'ADMIN_DB_PREFLIGHT_STATE_REJECTED',
  'ADMIN_DB_PREFLIGHT_TRANSPORT_REJECTED',
  'ADMIN_DB_PREFLIGHT_VERSION_REJECTED',
]);

function readConfig() {
  const env = process.env;
  const config = readObject(readBytes(env.RELEASE_PHASE_CONFIG, 'CONFIG'), 'CONFIG');
  const scratch = config.environment === 'scratch';
  if (
    config.version !== 1 ||
    !(scratch ? env.NODE_ENV === 'test' : ['staging', 'production'].includes(config.environment)) ||
    !matches(COMMIT, config.commitSha) ||
    ![
      'journalSha256',
      'ledgerSha256',
      'registrySha256',
      'backendMarkerSha256',
      'publicKeySha256',
      'caSha256',
    ].every(key => matches(HEX, config[key])) ||
    !matches(ID, config.teamId) ||
    !matches(ID, config.projectId) ||
    typeof config.expectedRolsuper !== 'boolean' ||
    typeof config.expectedRolbypassrls !== 'boolean' ||
    (scratch
      ? !matches(/^127\.0\.0\.1:[1-9]\d{0,4}$/u, config.endpoint)
      : config.expectedRolsuper ||
        !matches(/^db\.[a-z0-9]{20}\.supabase\.co:5432$/u, config.endpoint))
  )
    throw new Error('OWNER_CONFIG_INVALID');
  return { config, scratch };
}

function journalFrom(folder, policy) {
  try {
    return readReleaseJournal(folder, policy);
  } catch (error) {
    if (error instanceof SyntaxError || error?.code === 'ENOENT')
      throw new Error('JOURNAL_INPUT_UNAVAILABLE');
    throw error;
  }
}

async function main() {
  const env = process.env;
  const [folder, mode = 'expand', ...extra] = process.argv.slice(2);
  if (!folder || extra.length || !['inspect', 'expand', 'contract', 'recover'].includes(mode))
    throw new Error('RELEASE_USAGE_INVALID');
  if (mode === 'inspect') {
    const { journalSha256, ledgerSha256, registrySha256, contracts, entries } = journalFrom(
      folder,
      POLICY
    );
    return {
      journalSha256,
      ledgerSha256,
      registrySha256,
      pairs: contracts.map(idx => ({ expand: entries[idx - 1], contract: entries[idx] })),
    };
  }

  const { config, scratch } = readConfig();
  const journal = journalFrom(folder, (scratch && env.RELEASE_PHASE_TEST_POLICY) || POLICY);
  if (['journalSha256', 'ledgerSha256', 'registrySha256'].some(key => journal[key] !== config[key]))
    throw new Error('CANDIDATE_PIN_MISMATCH');
  const context = { version: 1, environment: config.environment, commitSha: config.commitSha };

  let request = { mode };
  if (mode !== 'expand') {
    const manifestBytes = readBytes(env.RELEASE_PHASE_MANIFEST, 'MANIFEST');
    const manifest = readObject(manifestBytes, 'MANIFEST');
    if (
      !Object.keys(context).every(key => manifest[key] === context[key]) ||
      !object(manifest.plan)
    )
      throw new Error('MANIFEST_PLAN_MISMATCH');
    request.plan = manifest.plan;
    if (mode === 'contract') {
      if (!matches(HEX, env.RELEASE_PHASE_ATTEMPT)) throw new Error('ATTEMPT_INVALID');
      const raw = readBytes(env.RELEASE_PHASE_RECEIPT, 'RECEIPT');
      const key = verificationKey(env.RELEASE_PHASE_PUBLIC_KEY, config.publicKeySha256);
      const signature = readBytes(env.RELEASE_PHASE_SIGNATURE, 'RECEIPT', 64);
      const approval = verifyDrainReceipt(raw, signature, key, {
        environment: config.environment,
        manifestSha256: digest(manifestBytes),
        attempt: env.RELEASE_PHASE_ATTEMPT,
      });
      request.approval = {
        ...approval,
        verifyLive: () =>
          verifyDeployment(
            approval.deployment,
            manifest,
            config,
            scratch
              ? readObject(readBytes(env.RELEASE_PHASE_TEST_DEPLOYMENT, 'FIXTURE'), 'FIXTURE')
              : null
          ),
      };
    }
  }

  if (scratch) assertDisposableUrl(env.RELEASE_MIGRATION_URL ?? '');
  const authority = {
    environmentClass: scratch ? 'local_scratch' : 'supabase_direct',
    endpointSha256: digest(config.endpoint),
    caSha256: config.caSha256,
    expectedRolsuper: config.expectedRolsuper,
    expectedRolbypassrls: config.expectedRolbypassrls,
  };
  let result;
  let operationError;
  let operationStarted = false;
  const preflight = await withPreflightedAdminConnection(
    {
      DATABASE_URL: env.RELEASE_MIGRATION_URL,
      DATABASE_ADMIN_CA_PEM_BASE64: env.RELEASE_DATABASE_CA_BASE64,
      NODE_ENV: scratch ? 'test' : undefined,
      ADMIN_DB_LOCAL_SCRATCH: scratch ? '1' : undefined,
    },
    Date.now(),
    AbortSignal.timeout(12 * 60_000),
    { ...authority, receiptSha256: digest(JSON.stringify(authority)) },
    async sql => {
      operationStarted = true;
      try {
        if (scratch) {
          const [{ server_version_num }] = await sql`SHOW server_version_num`;
          if (!/^16\d{4}$/u.test(server_version_num))
            throw new Error('ADMIN_DB_PREFLIGHT_VERSION_REJECTED');
        }
        result = await runReleaseMigrations(
          sql,
          journal,
          config.backendMarkerSha256,
          request,
          scratch
        );
      } catch (error) {
        operationError = error;
        throw error;
      }
    }
  );
  if (!preflight.ok) {
    if (operationError) throw operationError;
    if (operationStarted && mode !== 'recover')
      throw new Error('RELEASE_TRANSACTION_OUTCOME_UNKNOWN');
    throw new Error(preflight.error.code);
  }
  return { ...context, ...result };
}

try {
  process.stdout.write(`${JSON.stringify(await main())}\n`);
} catch (error) {
  const code = SAFE_CODES.has(error?.message) ? error.message : 'MIGRATION_PHASE_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}

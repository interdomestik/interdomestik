// Run with tsx from the independently reviewed owner checkout.
import { fileURLToPath } from 'node:url';
import { withPreflightedAdminConnection } from '../../../packages/database/src/admin-connection-preflight.ts';
import { assertDisposableUrl } from '../../../packages/database/src/disposable-client.ts';
import {
  readReleaseJournal,
  runReleaseMigrations,
} from '../../../packages/database/src/release-migrations.ts';
import safeCodes from './safe-codes.json' with { type: 'json' };
import { reserveAttempt } from './attempt.mjs';
import { verifyDeployment } from './deployment.mjs';
import {
  COMMIT,
  HEX,
  ID,
  authenticateDrainReceipt,
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
const SAFE_CODES = new Set(safeCodes);

function validateConfig(config, env) {
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
  return scratch;
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

async function runWithAdminConnection(env, config, journal, request, scratch) {
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
    if (operationStarted && request.mode !== 'recover')
      throw new Error('RELEASE_TRANSACTION_OUTCOME_UNKNOWN');
    throw new Error(preflight.error.code);
  }
  return result;
}

async function main() {
  const env = process.env;
  const [folder, mode = 'expand', ...extra] = process.argv.slice(2);
  let config;
  let receipt;
  if (mode === 'contract') {
    config = readObject(readBytes(env.RELEASE_PHASE_CONFIG, 'CONFIG'), 'CONFIG');
    const raw = readBytes(env.RELEASE_PHASE_RECEIPT, 'RECEIPT');
    const key = verificationKey(env.RELEASE_PHASE_PUBLIC_KEY, config.publicKeySha256);
    const signature = readBytes(env.RELEASE_PHASE_SIGNATURE, 'RECEIPT', 4096);
    receipt = authenticateDrainReceipt(raw, signature, key);
    // Use the signed nonce even if the invocation names a different attempt or cannot connect.
    reserveAttempt(config.attemptDirectory, receipt.attempt);
  }
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

  config ??= readObject(readBytes(env.RELEASE_PHASE_CONFIG, 'CONFIG'), 'CONFIG');
  const scratch = validateConfig(config, env);
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
      const approval = verifyDrainReceipt(receipt, {
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

  const result = await runWithAdminConnection(env, config, journal, request, scratch);
  return { ...context, ...result };
}

try {
  process.stdout.write(`${JSON.stringify(await main())}\n`);
} catch (error) {
  const code = SAFE_CODES.has(error?.message) ? error.message : 'MIGRATION_PHASE_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}

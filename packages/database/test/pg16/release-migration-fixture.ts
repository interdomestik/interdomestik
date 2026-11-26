import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readReleaseJournal, sha256 } from '../../src/release-migrations';
import type { ScratchClient } from './scratch-database';

const cli = fileURLToPath(
  new URL('../../../../scripts/ci/migration-phase/run.mjs', import.meta.url)
);
const dbPackage = fileURLToPath(new URL('../../', import.meta.url));
export const folder = fileURLToPath(new URL('../../drizzle/', import.meta.url));
export const policy = path.join(folder, 'contract-phases.json');
const tags = ['0000_base', '0001_writer_expand', '0002_writer_contract', '0003_suffix'];
const statements = [
  'CREATE TABLE writer (id serial PRIMARY KEY, legacy integer NOT NULL)',
  'ALTER TABLE writer ADD COLUMN replacement integer DEFAULT 0 NOT NULL',
  'ALTER TABLE writer DROP COLUMN legacy',
  'ALTER TABLE writer ADD COLUMN suffix integer',
];
const pairs = { '0002_writer_contract': '0001_writer_expand' };
const marker = 'scratch-release-phase';
const aliasHostname = 'staging.interdomestik.com';

function workspace(t: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-phase-'));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  return dir;
}

export function makeJournal(t: TestContext, { names = tags, contract = statements[2] } = {}) {
  const dir = workspace(t);
  const registry = path.join(dir, 'owner-policy.json');
  mkdirSync(path.join(dir, 'meta'));
  // Historical timestamps need not increase. PostgreSQL ledger insertion order is authoritative.
  const times = [20, 10, 30, 40, 50];
  const entries = names.map((tag, idx) => ({
    idx,
    version: '7',
    when: times[idx],
    tag,
    breakpoints: true,
  }));
  writeFileSync(path.join(dir, 'meta/_journal.json'), JSON.stringify({ version: '7', entries }));
  writeFileSync(
    registry,
    JSON.stringify({
      version: 1,
      pairs,
      sqlSha256: {
        '0001_writer_expand': sha256(statements[1]),
        '0002_writer_contract': sha256(contract),
      },
    })
  );
  entries.forEach(({ tag, idx }) =>
    writeFileSync(
      path.join(dir, `${tag}.sql`),
      idx === 2 ? contract : (statements[idx] ?? 'SELECT 1')
    )
  );
  return { dir, registry };
}

export async function assertLedger(
  client: ScratchClient,
  journal: ReturnType<typeof readReleaseJournal>,
  count: number
) {
  const rows =
    await client`SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id`;
  assert.deepEqual(
    [...rows],
    journal.entries.slice(0, count).map(({ hash, when }) => ({
      hash,
      created_at: String(when),
    }))
  );
}

export async function releaseFixture(
  t: TestContext,
  client: ScratchClient,
  url: URL,
  dir: string,
  registry: string,
  commitSha = 'a'.repeat(40)
) {
  await client`ALTER SCHEMA public OWNER TO CURRENT_USER`;
  await client`REVOKE CREATE ON SCHEMA public FROM PUBLIC`;
  await client`CREATE SCHEMA runtime_attestation`;
  await client`CREATE TABLE runtime_attestation.backend_marker (marker text PRIMARY KEY)`;
  await client`INSERT INTO runtime_attestation.backend_marker VALUES (${marker})`;
  const [{ rolsuper, rolbypassrls }] = await client`
    SELECT rolsuper, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user
  `;

  const temp = workspace(t);
  const files = (file: string) => path.join(temp, file);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const key = publicKey.export({ type: 'spki', format: 'pem' });
  writeFileSync(files('owner.pem'), key);
  const journal = readReleaseJournal(dir, registry);
  const config = {
    version: 1,
    environment: 'scratch',
    commitSha,
    journalSha256: journal.journalSha256,
    ledgerSha256: journal.ledgerSha256,
    registrySha256: journal.registrySha256,
    backendMarkerSha256: sha256(marker),
    publicKeySha256: sha256(key),
    caSha256: sha256(''),
    endpoint: url.host,
    expectedRolsuper: rolsuper,
    expectedRolbypassrls: rolbypassrls,
    teamId: 'team_fixture',
    projectId: 'prj_fixture',
  };
  writeFileSync(files('config.json'), JSON.stringify(config));

  const deployment = {
    id: 'dpl_fixture',
    hostname: 'release-fixture.vercel.app',
    imageDigest: `sha256:${'b'.repeat(64)}`,
    buildDigest: `sha256:${'c'.repeat(64)}`,
    aliasUid: 'alias_fixture',
    aliasUpdatedAt: Date.now() - 4000,
  };
  const live = {
    deployment: {
      id: deployment.id,
      url: deployment.hostname,
      projectId: config.projectId,
      teamId: config.teamId,
      readyState: 'READY',
    },
    metadata: {
      environment: config.environment,
      commitSha,
      sourceImageDigest: deployment.imageDigest,
      vercelOutputDigest: deployment.buildDigest,
    },
    alias: {
      alias: aliasHostname,
      uid: deployment.aliasUid,
      updatedAt: deployment.aliasUpdatedAt,
      deploymentId: deployment.id,
      projectId: config.projectId,
    },
  };
  const livePath = files('deployment.json');
  writeFileSync(livePath, JSON.stringify(live));

  async function run(mode?: 'expand' | 'contract' | 'recover', overrides = {}) {
    return new Promise<{ code: number | string; stdout: string; stderr: string }>(resolve =>
      execFile(
        process.execPath,
        ['--import', 'tsx', cli, dir, ...(mode ? [mode] : [])],
        {
          cwd: dbPackage,
          timeout: 90_000,
          env: {
            PATH: process.env.PATH,
            NODE_ENV: 'test',
            RELEASE_MIGRATION_URL: url.toString(),
            RELEASE_PHASE_CONFIG: files('config.json'),
            RELEASE_PHASE_MANIFEST: files('manifest.json'),
            RELEASE_PHASE_PUBLIC_KEY: files('owner.pem'),
            RELEASE_PHASE_TEST_DEPLOYMENT: livePath,
            ...(registry === policy ? {} : { RELEASE_PHASE_TEST_POLICY: registry }),
            ...overrides,
          },
        },
        (error, stdout, stderr) =>
          resolve({
            code: error?.code ?? (error ? 1 : 0),
            stdout,
            stderr,
          })
      )
    );
  }

  let manifestSha256: string;
  async function expand() {
    const result = await run();
    assert.equal(result.code, 0, result.stderr);
    manifestSha256 = sha256(result.stdout);
    writeFileSync(files('manifest.json'), result.stdout);
    return JSON.parse(result.stdout).plan as {
      expand: { tag: string };
      contract: { tag: string } | null;
      expandCount: number;
      finalCount: number;
    };
  }

  function receipt() {
    const observedAt = Date.now();
    return {
      version: 1,
      environment: config.environment,
      manifestSha256,
      attempt: randomBytes(32).toString('hex'),
      deployment,
      observedAt,
      expiresAt: observedAt + 300_000,
      drain: {
        evidenceSha256: sha256('rehearsal inventory'),
        fenceId: 'scratch-fence',
        webEndpoints: ['predecessor'],
        workers: [],
        schedulers: [],
        queues: [],
        outstandingWrites: 0,
        inFlightTransactions: 0,
        preparedTransactions: 0,
      },
    };
  }

  function approval(document = receipt(), options: { raw?: Buffer | null; forged?: boolean } = {}) {
    const raw = options.raw === undefined ? Buffer.from(JSON.stringify(document)) : options.raw;
    const receiptPath = files(`${document.attempt}.json`);
    const sigPath = files(`${document.attempt}.sig`);
    if (raw !== null) {
      writeFileSync(receiptPath, raw);
      writeFileSync(
        sigPath,
        sign(null, raw, options.forged ? generateKeyPairSync('ed25519').privateKey : privateKey)
      );
    }
    return {
      RELEASE_PHASE_ATTEMPT: document.attempt,
      RELEASE_PHASE_RECEIPT: receiptPath,
      RELEASE_PHASE_SIGNATURE: sigPath,
    };
  }

  return { config, files, live, livePath, journal, run, expand, approval, receipt };
}

export function assertRefusal(
  result: Awaited<ReturnType<Awaited<ReturnType<typeof releaseFixture>>['run']>>,
  reason: string
) {
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), reason);
}

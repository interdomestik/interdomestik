import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeTestSigner } from '../../../../scripts/ci/migration-phase-test-key.mjs';
import { withDisposableCleanup, withDisposableClient } from '../../src/disposable-client';
import { readReleaseJournal, sha256 } from '../../src/release-migrations';
import { quoteIdentifier } from '../rls-test-connection';
import { policy, workspace } from './release-migration-journal.fixture';
import { type ScratchClient, withScratchDatabase } from './scratch-database';

const cli = fileURLToPath(
  new URL('../../../../scripts/ci/migration-phase/run.mjs', import.meta.url)
);
const dbPackage = fileURLToPath(new URL('../../', import.meta.url));
const marker = 'scratch-release-phase';
const aliasHostname = 'staging.interdomestik.com';
export const scratchOptions = { loopbackOnly: true, requirePg16: true };

export async function withReleaseDatabase<T>(
  prefix: string,
  inputs: { t: TestContext; dir: string; registry: string; commitSha?: string },
  work: (client: ScratchClient, fixture: ReturnType<typeof releaseFixture>) => Promise<T>
): Promise<T> {
  const rawAdminUrl = process.env.DATABASE_URL ?? '';
  return withDisposableClient(
    rawAdminUrl,
    { applicationName: 'release_phase_setup' },
    async admin => {
      const { hostname, port, search, hash } = new URL(rawAdminUrl);
      if (hostname !== '127.0.0.1' || !port || search || hash)
        throw new Error('Release fixture requires an explicit loopback PostgreSQL endpoint');

      const owner = `release_phase_${randomBytes(6).toString('hex')}`;
      const role = quoteIdentifier(owner);
      const password = randomBytes(24).toString('hex');
      // The real journal installs btree_gist. Its public objects must also belong to the runner.
      await admin.unsafe(
        `CREATE ROLE ${role} LOGIN SUPERUSER NOBYPASSRLS NOREPLICATION PASSWORD '${password}'`
      );
      return withDisposableCleanup(
        () =>
          withScratchDatabase(
            prefix,
            async (client, _admin, scratchUrl) => {
              const runnerUrl = new URL(scratchUrl);
              runnerUrl.username = owner;
              runnerUrl.password = password;
              await withDisposableClient(
                runnerUrl.toString(),
                { applicationName: 'release_phase_enrollment' },
                async runner => {
                  await runner`ALTER SCHEMA public OWNER TO CURRENT_USER`;
                  await runner`REVOKE CREATE ON SCHEMA public FROM PUBLIC`;
                  await runner`CREATE SCHEMA runtime_attestation`;
                  await runner`CREATE TABLE runtime_attestation.backend_marker (marker text PRIMARY KEY)`;
                  await runner`INSERT INTO runtime_attestation.backend_marker VALUES (${marker})`;
                }
              );
              const { t, dir, registry, commitSha } = inputs;
              return work(client, releaseFixture(t, runnerUrl, dir, registry, commitSha));
            },
            { ...scratchOptions, owner }
          ),
        async () => {
          await admin.unsafe(`DROP ROLE ${role}`);
        },
        'Release scratch database work and role teardown both failed'
      );
    }
  );
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

export function releaseFixture(
  t: TestContext,
  url: URL,
  dir: string,
  registry: string,
  commitSha = 'a'.repeat(40)
) {
  const temp = workspace(t);
  const files = (file: string) => path.join(temp, file);
  const signer = makeTestSigner();
  writeFileSync(files('owner.pub'), signer.key);
  const attemptDirectory = files('attempts');
  mkdirSync(attemptDirectory, { mode: 0o700 });
  const journal = readReleaseJournal(dir, registry, {
    candidateRoot: dir,
    policyRoot: registry === policy ? path.dirname(policy) : dir,
  });
  const config = {
    version: 1,
    environment: 'scratch',
    commitSha,
    journalSha256: journal.journalSha256,
    ledgerSha256: journal.ledgerSha256,
    registrySha256: journal.registrySha256,
    backendMarkerSha256: sha256(marker),
    publicKeySha256: sha256(signer.key),
    attemptDirectory,
    caSha256: sha256(''),
    endpoint: url.host,
    expectedRolsuper: true,
    expectedRolbypassrls: false,
    teamId: 'team_fixture',
    projectId: 'prj_fixture',
    deploymentHosts: ['release-fixture.vercel.app'],
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

  async function run(mode?: 'inspect' | 'expand' | 'contract' | 'recover', overrides = {}) {
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
            RELEASE_PHASE_CANDIDATE_ROOT: dir,
            RELEASE_PHASE_RUNNER_ROOT: temp,
            RELEASE_PHASE_CONFIG: files('config.json'),
            RELEASE_PHASE_MANIFEST: files('manifest.json'),
            RELEASE_PHASE_PUBLIC_KEY: files('owner.pub'),
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
      writeFileSync(sigPath, (options.forged ? makeTestSigner() : signer).sign(raw));
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

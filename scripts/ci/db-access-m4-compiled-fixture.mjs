import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { provisionM4Fixture } from './db-access-m4-compiled-provision.mjs';
import { validateM4StrictOps } from './db-access-m4-compiled-ops-observation.mjs';
import { createM4CompiledLayout } from './db-access-m4-compiled-layout.mjs';
import { openM4CompiledBackend } from './db-access-m4-compiled-backend-client.mjs';
import { validateM4CompiledObservations } from './db-access-m4-compiled-observations.mjs';
import {
  prepareM4CompiledPlatform,
  startM4CompiledNext,
  runM4CompiledBrowser,
  closeM4CompiledPlatform,
  takeM4CompiledPlatformEvidence,
} from './db-access-m4-compiled-platform.mjs';

function dependencies(root) {
  const owned = fs.realpathSync(root),
    require = createRequire(path.join(owned, 'package.json'));
  const resolve = (loader, name) => {
    const file = fs.realpathSync(loader.resolve(name));
    assert(file.startsWith(owned + path.sep));
    return file;
  };
  const postgres = require(resolve(require, 'postgres'));
  const { drizzle } = require(resolve(require, 'drizzle-orm/postgres-js'));
  const { migrate } = require(resolve(require, 'drizzle-orm/postgres-js/migrator'));
  const auth = createRequire(resolve(require, 'better-auth'));
  const { serializeSignedCookie } = auth(resolve(auth, 'better-call'));
  return { postgres, drizzle, migrate, serializeSignedCookie };
}

async function seedCases(f, serializeSignedCookie) {
  const staffActor = f.secondStaff,
    token = randomBytes(24).toString('hex');
  await f.admin`update "user" set branch_id=${f.branchA} where id=${staffActor}`;
  await f.admin`insert into session(id,token,"userId","expiresAt","createdAt","updatedAt")
    values (${'compiled_staff_' + f.suffix},${token},${staffActor},now()+interval '1 hour',now(),now())`;
  const staffCookie = (
    await serializeSignedCookie(
      '__Secure-better-auth.session_token',
      token,
      f.config.issuerSecret,
      { path: '/', secure: true }
    )
  ).split(';', 1)[0];
  const cases = ['legacy-admin', 'legacy-agent', 'staff'].map((profile, index) => ({
    profile,
    claimId: 'compiled_' + index + '_' + f.suffix,
    actorId: profile === 'staff' ? staffActor : f.actor,
    tenantId: f.home,
    staffId: profile === 'staff' ? staffActor : f.staff,
  }));
  for (const row of cases) await f.seedClaim(row.claimId);
  await f.admin`update claim set branch_id=${f.branchA} where id=${cases[2].claimId}`;
  const plan = {
    version: 1,
    runId: randomUUID(),
    scenarios: cases.map(row => ({
      profile: row.profile,
      claimId: row.claimId,
      targetMode: row.profile === 'staff' ? 'omitted' : 'value',
      staffId: row.profile === 'staff' ? null : row.staffId,
    })),
  };
  const cookies = {
    version: 1,
    cases: cases.map(row => {
      const cookie = row.profile === 'staff' ? staffCookie : f.cookie,
        split = cookie.indexOf('=');
      return {
        profile: row.profile,
        cookies: [{ name: cookie.slice(0, split), value: cookie.slice(split + 1) }],
      };
    }),
  };
  return { cases, plan, cookies };
}

// Real administrator observations stay in the trusted parent of the restricted ESM backend.
export async function executeM4CompiledFixture({
  root,
  adminURL,
  databaseTLS,
  compiledPackageRoot,
  producerRoot,
  candidateRoot,
  workRoot,
  deadlineAt,
}) {
  const target = new URL(adminURL);
  assert.equal(target.protocol, 'postgresql:');
  assert.equal(target.hostname, '127.0.0.1');
  assert(['5432', '55438'].includes(target.port));
  assert.equal(target.pathname, '/interdomestik_compiled_test');
  assert.equal(target.username, 'postgres');
  assert(target.password && !target.search && !target.hash);
  let platform, client, fixture, observations, platformEvidence, cleanup, failure;
  let strictOpsObservation, strictOwnerConstruction;
  try {
    // Only the fixed producer-owned platform executes and captures these controls.
    const layout = createM4CompiledLayout(workRoot, root);
    platform = await prepareM4CompiledPlatform({
      layout,
      databaseTLS,
      compiledPackageRoot,
      root,
      producerRoot,
      candidateRoot,
      workRoot,
      deadlineAt,
    });
    const {
      postgres: installedPostgres,
      drizzle,
      migrate,
      serializeSignedCookie,
    } = dependencies(root);
    const postgres = (url, options) =>
      installedPostgres(url, {
        ...options,
        ssl: { ca: databaseTLS.caPem, rejectUnauthorized: true },
      });
    const admin = postgres(target.href, { max: 1, ssl: false });
    try {
      await migrate(drizzle(admin), {
        migrationsFolder: path.join(root, 'packages/database/drizzle'),
      });
    } finally {
      await admin.end({ timeout: 0 });
    }
    client = openM4CompiledBackend(root, platform, deadlineAt);
    fixture = await provisionM4Fixture({
      postgres,
      serializeSignedCookie,
      adminURL: target.href,
      client,
      profiles: true,
      record: {},
      run: undefined,
    });
    const { cases, plan, cookies } = await seedCases(fixture, serializeSignedCookie);
    const ownerOrigin = await client.origin();
    const opsClaimId = 'compiled_ops_' + fixture.suffix;
    await fixture.seedClaim(opsClaimId);
    const opsRequest = fixture.request(opsClaimId);
    const opsRecord = await client.executeOps(fixture.cookie, JSON.stringify(opsRequest));
    await startM4CompiledNext(platform, { ownerOrigin, plan, cookies });
    const browser = await runM4CompiledBrowser(platform);
    // Stop and settle real notification tasks before independent SQL readback.
    const owner = await client.close();
    strictOwnerConstruction = owner;
    const opsSql = await fixture.state(opsClaimId);
    opsSql.target = Array.from(
      await fixture.admin`select id,role,tenant_id from "user" where id=${fixture.staff}`
    );
    opsSql.notifications = Array.from(
      await fixture.admin`select id from notifications where tenant_id=${fixture.home} and action_url=${'/staff/claims/' + opsClaimId}`
    );
    strictOpsObservation = validateM4StrictOps({
      request: opsRequest,
      record: opsRecord,
      sql: opsSql,
      expected: { actorId: fixture.actor, tenantId: fixture.home },
      ownerInstanceId: owner.ownerInstanceId,
    });
    await fixture.noOwnedSessions();
    const sql = [];
    for (const row of cases) {
      const state = await fixture.state(row.claimId);
      state.target = Array.from(
        await fixture.admin`select id,role,tenant_id,"emailVerified" from "user" where id=${row.staffId}`
      );
      state.notifications = Array.from(
        await fixture.admin`select * from notifications where tenant_id=${row.tenantId} and action_url=${'/staff/claims/' + row.claimId}`
      );
      sql.push(state);
    }
    const deniedOperation = browser.denial?.operationId;
    assert.match(
      deniedOperation,
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
    );
    // Global operation lookup, not only the three expected claim IDs. Audit has no
    // operation-ID column: this supplementary UUID search accompanies exact claim audits.
    const denialSql = {
      ledger: Array.from(
        await fixture.admin`select operation_id from operation_results where operation_id=${deniedOperation} limit 1`
      ),
      audit: Array.from(
        await fixture.admin`select id from audit_log where entity_id=${deniedOperation} or metadata::text like ${'%' + deniedOperation + '%'} limit 1`
      ),
    };
    await closeM4CompiledPlatform(platform);
    platformEvidence = takeM4CompiledPlatformEvidence(platform);
    // The source-owned platform evidence is taken only after actual controls and process drain.
    observations = validateM4CompiledObservations({
      cases,
      browser,
      owner,
      sql,
      denialSql,
      actionMap: platformEvidence.actionMap,
    });
  } catch (error) {
    failure = error;
    if (error.teardown) cleanup = error.teardown;
  } finally {
    if (client)
      await client.close().catch(error => {
        failure ??= error;
      });
    if (platform)
      await closeM4CompiledPlatform(platform).catch(error => {
        failure ??= error;
      });
    if (fixture) {
      try {
        cleanup = await fixture.cleanup();
      } catch (error) {
        failure ??= error;
      }
    }
  }
  if (failure) throw failure;
  assert.equal(cleanup?.complete, true);
  assert.equal(cleanup.forcedTermination, false);
  assert.equal(cleanup.remainingOwnedSessions, 0);
  assert(performance.now() <= deadlineAt);
  return {
    version: 1,
    kind: 'owned-strict-compiled-execution',
    observations,
    strictOpsObservation,
    strictOwnerConstruction,
    platformEvidence,
    cleanup: {
      complete: true,
      forcedTermination: false,
      remainingOwnedSessions: 0,
    },
    runtimeAdmission: false,
    nativeAdmission: false,
    productionCCredit: 0,
  };
}

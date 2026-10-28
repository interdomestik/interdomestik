import assert from 'node:assert/strict';
import { createM4EmailObserverFixtureFactory } from './db-access-m4-email-observer-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { openM4RestrictedChild } from './db-access-m4-runtime-client.mjs';
import { provisionM4Fixture, code } from './db-access-m4-runtime-fixture-provision.mjs';
import { assertMinimalOpsGrants } from './db-access-m4-runtime-fixture-minimal-grants.mjs';
import { runPrivateCases } from './db-access-m4-runtime-fixture-private.mjs';
import { runProfileCases } from './db-access-m4-runtime-fixture-profiles.mjs';
import { createM4RuntimeFixtureTls } from './db-access-m4-runtime-fixture-tls.mjs';
import { runMountedAssignmentCases } from './db-access-m4-runtime-fixture-mounted.mjs';
import { M4_RUNTIME_CONTRACT as contract } from './db-access-m4-runtime-contract.mjs';

// Failure diagnostics expose only a fixed fixture basename and numeric location;
// assertion messages, values, full stacks and connection configuration stay private.
export function m4FixtureFailureSite(error) {
  const site = String(error?.stack ?? '')
    .split('\n')
    .map(line => /^\s+at\s+.*\/(db-access-m4-[a-z0-9-]+\.mjs):(\d+):(\d+)\)?$/u.exec(line))
    .find(match => match && contract.fixtureFiles.includes(match[1]));
  return site ? { file: site[1], line: Number(site[2]), column: Number(site[3]) } : undefined;
}

function dependencies(root) {
  const owned = fs.realpathSync(root);
  const require = createRequire(path.join(owned, 'package.json'));
  const resolve = (loader, name) => {
    const file = fs.realpathSync(loader.resolve(name));
    assert(file.startsWith(owned + path.sep), 'Dependency escaped sealed runtime');
    return file;
  };
  const postgres = require(resolve(require, 'postgres'));
  const { drizzle } = require(resolve(require, 'drizzle-orm/postgres-js'));
  const { migrate } = require(resolve(require, 'drizzle-orm/postgres-js/migrator'));
  const authRequire = createRequire(resolve(require, 'better-auth'));
  const { serializeSignedCookie } = authRequire(resolve(authRequire, 'better-call'));
  return { postgres, drizzle, migrate, serializeSignedCookie };
}

// All administrator connections and oracle callbacks stay in this fixed producer parent.
export async function runM4RuntimeFixture({ root, adminURL, output }) {
  const target = new URL(adminURL);
  assert.equal(target.hostname, '127.0.0.1');
  assert(['5432', '55438'].includes(target.port));
  assert.equal(target.pathname, '/interdomestik_test');
  assert.equal(target.username, 'postgres');
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
  const destination = fs.realpathSync(output);
  assert(fs.statSync(destination).isDirectory());
  const { postgres, drizzle, migrate, serializeSignedCookie } = dependencies(root);
  const openObserverFixture = createM4EmailObserverFixtureFactory({
    root,
    postgres,
    serializeSignedCookie,
    adminURL: target.href,
  });
  const result = {
    version: 1,
    complete: false,
    setupComplete: false,
    cleanupComplete: false,
    privateCases: [],
    profileCases: [],
    remainingOwnedSessions: null,
    runtimeAdmission: false,
    nativeAdmission: false,
    diagnostics: {},
  };
  let client,
    active,
    stage = 'migrations';
  const cleanup = [];
  try {
    const migrationPool = postgres(target.href, { max: 1, ssl: false });
    try {
      await migrate(drizzle(migrationPool), {
        migrationsFolder: path.join(root, 'packages/database/drizzle'),
      });
    } finally {
      await migrationPool.end({ timeout: 0 });
    }
    client = await openM4RestrictedChild(root, createM4RuntimeFixtureTls());
    for (const profiles of [false, true]) {
      stage = profiles ? 'profiles-setup' : 'private-setup';
      const record = {};
      const cases = profiles ? result.profileCases : result.privateCases;
      const run = async (id, action) => {
        stage = id;
        await action();
        cases.push({ id, passed: true });
      };
      active = await provisionM4Fixture({
        postgres,
        serializeSignedCookie,
        adminURL: target.href,
        client,
        profiles,
        record,
        run,
      });
      if (!profiles) {
        stage = 'minimal-ops-privilege-diagnostic';
        result.minimalOpsPrivilegeDiagnostic = await assertMinimalOpsGrants(active);
        await runPrivateCases(active);
      } else {
        result.setupComplete = true;
        await runProfileCases({ ...active, openObserverFixture });
        await runMountedAssignmentCases(active);
      }
      result.diagnostics[profiles ? 'profiles' : 'private'] = record;
      stage = profiles ? 'profiles-cleanup' : 'private-cleanup';
      const retired = await active.cleanup();
      active = null;
      cleanup.push(retired);
      assert.equal(retired.complete, true, 'Fixture teardown failed');
    }
    assert.equal(result.privateCases.length, 16);
    assert.equal(result.profileCases.length, 23);
  } catch (error) {
    result.failure = {
      stage,
      name: error?.name ?? 'Error',
      code: code(error) ?? null,
      sourceSite: m4FixtureFailureSite(error),
    };
    if (error?.teardown) cleanup.push(error.teardown);
  } finally {
    if (active) cleanup.push(await active.cleanup());
    if (client) {
      try {
        const completion = await client.close();
        const { mountedAssignments, ...construction } = completion;
        result.assignmentContextConstruction = construction;
        result.mountedAssignments = mountedAssignments;
      } catch (error) {
        result.failure ??= {
          stage: 'child-close',
          name: error?.name ?? 'Error',
          code: code(error) ?? null,
        };
      }
    }
  }
  result.cleanupComplete = cleanup.length === 2 && cleanup.every(item => item.complete);
  result.remainingOwnedSessions = cleanup.length
    ? cleanup.reduce((sum, item) => sum + item.remainingOwnedSessions, 0)
    : null;
  result.diagnostics.cleanup = cleanup;
  result.complete =
    !result.failure &&
    result.setupComplete &&
    result.cleanupComplete &&
    result.privateCases.length === 16 &&
    result.profileCases.length === 23 &&
    result.remainingOwnedSessions === 0;
  return result;
}

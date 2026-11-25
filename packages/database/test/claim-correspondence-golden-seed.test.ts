import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../src/schema';
import { seedClaims } from '../src/seed-golden/claims';
import { seedMemberships } from '../src/seed-golden/memberships';
import { buildDiscoveryRowsToWrite, seedDiscovery } from '../src/seed-golden/discovery';
import {
  buildRoleRelationshipDocuments,
  seedRoleRelationshipDocuments,
} from '../src/seed-golden/role-relationships';
import { seedBranches, seedTenants } from '../src/seed-golden/tenants-branches';
import { seedUsers } from '../src/seed-golden/users';
import { createSeedConfig } from '../src/seed-types';
import { migrateJournal, scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';

const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));

test('WP-12 golden document upserts preserve the coordinates of surviving rows', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withScratchDatabase('wp12_golden', async client => {
    await migrateJournal(client, migrations);
    const db = drizzle(client, { schema });
    const { at } = createSeedConfig('golden', new Date('2026-01-02T00:00:00.000Z'));
    const context = { db, schema, at, sql };
    await seedTenants(context);
    await seedBranches(context);
    await seedUsers(context);
    await seedMemberships(context);
    await seedClaims(context);

    for (const [name, reseed, target] of [
      [
        'role-relationships',
        seedRoleRelationshipDocuments,
        buildRoleRelationshipDocuments({ at })[0],
      ],
      ['discovery', seedDiscovery, buildDiscoveryRowsToWrite().claimDocuments[0]],
    ] as const) {
      await t.test(name, async () => {
        assert.ok(target?.id);
        const where = eq(schema.claimDocuments.id, target.id);
        const [existing] = await db.select().from(schema.claimDocuments).where(where);
        assert.ok(existing, 'seed fixture must already exist before either upsert');
        assert.equal(existing.filePath, target.filePath);
        await db.update(schema.claimDocuments).set({ name: 'Name before reseed' }).where(where);
        await reseed(context);
        const [matching] = await db.select().from(schema.claimDocuments).where(where);
        assert.equal(matching.name, existing.name, 'the existing row was updated');
        assert.equal(matching.filePath, target.filePath);

        const differentPath = existing.filePath + '.stored';
        await db.transaction(async tx => {
          await tx.delete(schema.claimDocuments).where(where);
          await tx.insert(schema.claimDocuments).values({ ...existing, filePath: differentPath });
        });
        await assert.rejects(
          // The seed uses only the query builder, which a transaction handle provides too.
          db.transaction(tx => reseed({ ...context, db: tx as unknown as typeof db })),
          error => {
            const cause = error instanceof Error ? error.cause : undefined;
            return cause instanceof Error && 'code' in cause && cause.code === 'P1203';
          }
        );
        const [different] = await db.select().from(schema.claimDocuments).where(where);
        assert.equal(different.filePath, differentPath);
      });
    }
  });
});

import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

import * as schema from '../src/schema';
import type { TenantTransaction } from '../src/tenant';
import { importDomain } from './claim-correspondence-domain.fixture';
import {
  approve,
  attest,
  changeOwner,
  enrolledCase,
  ownerA,
  ownerB,
  publish,
} from './claim-correspondence-inbound-pilot.fixture';
import { homeTenant, restricted, type Connection } from './claim-correspondence.fixture';

async function readWithMemberScope<T>(
  client: postgres.Sql,
  viewer: string,
  run: (reader: TenantTransaction) => Promise<T>
) {
  return drizzle(client, { schema }).transaction(
    async tx => {
      await tx.execute(sql`set local row_security = on`);
      await tx.execute(sql`set local statement_timeout = '8s'`);
      await tx.execute(sql`select set_config('app.current_tenant_id', ${homeTenant}, true),
      set_config('app.current_access_tenant_id', ${homeTenant}, true),
      set_config('app.current_actor_id', ${viewer}, true)`);
      return run(tx);
    },
    { isolationLevel: 'read committed' }
  );
}

/** The used slice of the domain-documents `./claim-evidence` export, loaded at runtime. */
type MemberVaultEvidenceModule = {
  readCurrentMemberVaultEvidence(
    database: unknown,
    tenantId: string,
    claimId: string,
    viewerId: string
  ): Promise<Array<{ id: string; createdAt: unknown }>>;
};

export async function proveVaultRace(connections: Connection) {
  const { admin, runtime, peer } = connections;
  const claim = await enrolledCase(admin);
  const stale = await approve(connections, claim, 'intended-for-member');
  assert.equal(await attest(admin, stale), true);
  const { readCurrentMemberVaultEvidence } = await importDomain<MemberVaultEvidenceModule>(
    '/claim-evidence',
    'domain-documents'
  );
  // Hold the former owner's real read transaction open after its first query.
  await readWithMemberScope(peer, ownerA, async former => {
    const [first] = await former.execute<{ id: string }>(sql`
      select id from claim where id = ${claim.id} and "userId" = ${ownerA}`);
    assert.equal(first?.id, claim.id);
    await restricted(runtime, tx => changeOwner(tx, claim));
    await assert.rejects(
      restricted(runtime, tx => publish(tx, stale)),
      { code: 'P1211' }
    );
    const fresh = await approve(connections, claim, 'intended-for-member');
    assert.equal(await attest(admin, fresh), true);
    await restricted(runtime, tx => publish(tx, fresh));

    const oldItems = await readCurrentMemberVaultEvidence(former, homeTenant, claim.id, ownerA);
    assert.deepEqual(oldItems, []);

    await readWithMemberScope(runtime, ownerB, async successor => {
      const newItems = await readCurrentMemberVaultEvidence(
        successor,
        homeTenant,
        claim.id,
        ownerB
      );
      assert.deepEqual(
        newItems.map(item => item.id),
        [fresh.id]
      );
      assert.ok(newItems[0]?.createdAt instanceof Date);
    });
  });
}

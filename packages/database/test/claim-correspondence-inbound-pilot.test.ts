import test from 'node:test';

import { withDomainPools } from './claim-correspondence-domain.fixture';
import {
  proveDirectDecisionBranch,
  proveDirectPublicationBranch,
  proveReceivedActorScope,
} from './claim-correspondence-inbound-branch.fixture';
import {
  proveDecisionDenials,
  proveDecisionExpiry,
  proveDecisionGrants,
  provePendingDecisionVisibility,
} from './claim-correspondence-inbound-decision.fixture';
import {
  proveDarkPublication,
  proveStorageVerification,
  setup,
} from './claim-correspondence-inbound-pilot.fixture';
import {
  proveEnrollmentSnapshot,
  provePublishedScope,
} from './claim-correspondence-inbound-publication.fixture';
import {
  proveReceivedSet,
  proveRollbackPause,
  proveUnenrolledSeals,
} from './claim-correspondence-inbound-receipt.fixture';
import {
  proveOrdinaryPathSegment,
  provePolymorphicAliasMutation,
  proveReservation,
} from './claim-correspondence-inbound-reservation.fixture';
import { proveVaultRace } from './claim-correspondence-inbound-vault.fixture';
import { withRegisterDb } from './claim-correspondence.fixture';

test('WP-12.1 restricted runtime publication and receipt proofs', async t => {
  await withRegisterDb(t, async connections => {
    await setup(connections);
    await withDomainPools(connections.admin, connections.runtime, async () => {
      await t.test(
        'empty enrollment blocks reserved evidence under the runtime role and permits ordinary evidence',
        () => proveDarkPublication(connections)
      );
      await t.test(
        'the database refuses a direct unenrolled seal and ordinary correspondence still works',
        () => proveUnenrolledSeals(connections)
      );
      await t.test('hides pending decision metadata from same-tenant members and staff peers', () =>
        provePendingDecisionVisibility(connections)
      );
      await t.test('production decision command works with restricted insert columns', () =>
        proveDecisionGrants(connections)
      );
      await t.test('direct decision writes enforce branch', () =>
        proveDirectDecisionBranch(connections)
      );
      await t.test('direct publication writes enforce branch', () =>
        proveDirectPublicationBranch(connections)
      );
      await t.test(
        'the received-link command enforces the assigned staff scope for new links and replays',
        () => proveReceivedActorScope(connections)
      );
      await t.test(
        'the authority wrapper refuses expired unpublished decisions and allows only assigned staff to replay a committed decision',
        () => proveDecisionExpiry(connections)
      );
      await t.test(
        'only the PostgreSQL verifier can attest the exact approved object for publication',
        () => proveStorageVerification(connections)
      );
      await t.test('refuses decisions outside the assigned home-tenant role and case scope', () =>
        proveDecisionDenials(connections)
      );
      await t.test('pilot freezes published scope and serializes recipient changes under RLS', () =>
        provePublishedScope(connections)
      );
      await t.test(
        'reserved keys reject reparenting and polymorphic aliases across snapshots',
        () => proveReservation(connections)
      );
      for (const mutation of ['rekey', 'restore', 'upsert'] as const) {
        await t.test(`reserved encoded basename fails on a polymorphic ${mutation}`, () =>
          provePolymorphicAliasMutation(connections, mutation)
        );
      }
      await t.test('older snapshots cannot publish ordinary evidence after activation', () =>
        proveEnrollmentSnapshot(connections)
      );
      await t.test('ordinary case IDs with the pilot prefix keep their ordinary file paths', () =>
        proveOrdinaryPathSegment(connections)
      );
      await t.test(
        'transfer before publication does not enter the former owner’s MK vault snapshot',
        () => proveVaultRace(connections)
      );
      await t.test('seals exactly the received set and preserves empty historical receipts', () =>
        proveReceivedSet(connections)
      );
      await t.test('rollback closes receipt inserts while preserving self-supply', () =>
        proveRollbackPause(connections)
      );
    });
  });
});

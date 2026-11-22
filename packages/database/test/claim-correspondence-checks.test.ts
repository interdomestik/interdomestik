import assert from 'node:assert/strict';
import test from 'node:test';
import type postgres from 'postgres';

import {
  withRegisterDb,
  restricted,
  setScope,
  type Connection,
  createBases,
  documentInput,
  earlier,
  grantInput,
  homeTenant,
  inboundInput,
  insertClaim,
  insertDocument,
  insertEntry,
  insertGrant,
  outboundInput,
  past,
  registerTables,
} from './claim-correspondence.fixture';

import { quoteIdentifier } from './rls-test-connection';

async function rolledBackProof(
  admin: postgres.Sql,
  run: (tx: postgres.TransactionSql) => Promise<void>
) {
  const complete = new Error('scratch proof rolled back');
  await assert.rejects(
    admin.begin(async tx => {
      await run(tx);
      throw complete;
    }),
    error => error === complete
  );
}

async function assumeRuntime(tx: postgres.TransactionSql, role: string) {
  await tx.unsafe(`set local role ${quoteIdentifier(role)}`);
  await setScope(tx);
}

/** Temporarily remove user triggers in the scratch transaction so guard refusals cannot mask DDL. */
async function proveDeclarativeConstraints(
  { admin, role }: Connection,
  run: (tx: postgres.TransactionSql) => Promise<void>,
  prepare?: (tx: postgres.TransactionSql) => Promise<unknown>
) {
  await rolledBackProof(admin, async tx => {
    for (const table of registerTables)
      await tx.unsafe(`alter table ${table} disable trigger user`);
    await prepare?.(tx);
    await assumeRuntime(tx, role);
    await run(tx);
  });
}

const check = (constraint_name: string) => ({ code: '23514', constraint_name });
test('WP-12 database CHECK constraints under restricted writes', async t => {
  await withRegisterDb(t, async connections => {
    const { admin, runtime } = connections;
    const claim = await insertClaim(admin, { tenant: homeTenant });
    const own = await restricted(runtime, async tx => {
      const doc = await insertDocument(tx, documentInput(claim));
      const bases = await createBases(tx, claim, doc);
      const entry = await insertEntry(tx, outboundInput(claim, bases));
      return { claim, doc, bases, entry };
    });
    await t.test(
      'every register CHECK and each new claim-field CHECK rejects its own invalid value',
      async () => {
        const recovery = grantInput(own.claim, own.doc);
        const representation = grantInput(own.claim, own.doc, 'power_of_attorney');
        const consent = grantInput(own.claim, own.doc, 'consent_or_lawful_basis');
        const inbound = inboundInput(own.claim);
        const outbound = { ...outboundInput(own.claim, own.bases), decided_at: past };
        await proveDeclarativeConstraints(connections, async tx => {
          for (const [suffix, grant] of [
            ['kind', { ...recovery, kind: 'unsupported' }],
            ['kind_scope', { ...recovery, scope: 'representation' }],
            ['version', { ...recovery, version: ' \t' }],
            ['jurisdiction', { ...representation, jurisdiction_country_code: 'xk' }],
            ['jurisdiction', { ...representation, jurisdiction_attested_by_user_id: null }],
            ['jurisdiction', { ...representation, jurisdiction_attested_at: null }],
            ['purpose', { ...consent, purpose: null }],
            ['purpose', { ...consent, purpose: '\t' }],
            ['expiry', { ...recovery, expires_at: earlier }],
            ['revocation', { ...recovery, revoked_at: past }],
          ] as const) {
            await assert.rejects(
              tx.savepoint(one => insertGrant(one, grant)),
              check(`claim_authorities_${suffix}_check`)
            );
          }
          for (const [suffix, entry] of [
            ['direction', { ...inbound, direction: 'sideways' }],
            ['party_kind', { ...inbound, party_kind: 'unsupported' }],
            ['channel', { ...inbound, channel: 'carrier-pigeon' }],
            ['organisation', { ...inbound, party_organisation: '  ' }],
            ['body', { ...inbound, body: '\t' }],
            ['reply_direction', { ...outbound, in_reply_to_id: own.entry.id }],
            ['document_count', { ...outbound, shared_document_count: -1 }],
            ['sharing', { ...outbound, shared_document_count: 1 }],
            [
              'sharing',
              {
                ...outboundInput(own.claim, own.bases, 1),
                decided_at: past,
                sharing_attested_at: null,
              },
            ],
            ['outbound', { ...outbound, recovery_authority_id: null }],
            ['outbound', { ...outbound, representation_authority_id: null }],
            ['outbound', { ...outbound, decided_at: null }],
            ['inbound', { ...inbound, follow_up_at: past }],
            ['inbound', { ...inbound, decided_at: past }],
          ] as const) {
            await assert.rejects(
              tx.savepoint(one => insertEntry(one, entry)),
              check(`claim_correspondence_${suffix}_check`)
            );
          }
        });

        // The scope and kind/scope checks overlap. This savepoint isolates the former from the latter.
        await proveDeclarativeConstraints(
          connections,
          async tx => {
            await assert.rejects(
              tx.savepoint(one => insertGrant(one, { ...recovery, scope: 'unsupported' })),
              check('claim_authorities_scope_check')
            );
          },
          tx => tx`alter table claim_authorities drop constraint claim_authorities_kind_scope_check`
        );

        for (const [column, value] of [
          ['other_vehicle_country_code', 'xk'],
          ['insurance_proof_reference', '\t'],
          ['coverage_verification_status', 'approved'],
        ]) {
          await assert.rejects(
            restricted(
              runtime,
              tx => tx`update claim set ${tx({ [column]: value })} where id = ${own.claim.id}`
            ),
            check(`claim_${column}_check`)
          );
        }
      }
    );
  });
});

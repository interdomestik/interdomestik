import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type postgres from 'postgres';

import {
  withRegisterDb,
  foreignKey,
  restricted,
  setScope,
  unique,
  type Connection,
  createBases,
  documentInput,
  foreignActor,
  foreignTenant,
  grantInput,
  homeTenant,
  inboundInput,
  insertClaim,
  insertDocument,
  insertEntry,
  insertGrant,
  insertLink,
  linkInput,
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
  run: (tx: postgres.TransactionSql) => Promise<void>
) {
  await rolledBackProof(admin, async tx => {
    for (const table of registerTables)
      await tx.unsafe(`alter table ${table} disable trigger user`);
    await assumeRuntime(tx, role);
    await run(tx);
  });
}

test('WP-12 restricts tenant rows and enforces declarative constraints', async t => {
  await withRegisterDb(t, connections => proveConstraints(t, connections));
});

async function proveConstraints(t: TestContext, connections: Connection) {
  const { admin, runtime } = connections;
  async function seed(tenant: string) {
    const claim = await insertClaim(admin, { tenant });
    return restricted(
      runtime,
      async tx => {
        const doc = await insertDocument(tx, documentInput(claim));
        const bases = await createBases(tx, claim, doc);
        const entry = await insertEntry(tx, outboundInput(claim, bases, 1));
        const link = linkInput(entry, doc);
        await insertLink(tx, link);
        return { claim, doc, bases, entry, link };
      },
      { home: tenant }
    );
  }
  const own = await seed(homeTenant);
  const other = await seed(foreignTenant);
  const sameTenant = await seed(homeTenant);

  await t.test(
    'home tenant policies scope all rows and require a matching home claim on INSERT',
    async () => {
      const [posture] = await runtime`select current_user as role, rolsuper, rolbypassrls
      from pg_roles where rolname = current_user`;
      assert.deepEqual(posture, { role: connections.role, rolsuper: false, rolbypassrls: false });
      for (const table of registerTables) {
        const [rls] = await admin`select relrowsecurity, relforcerowsecurity
        from pg_class where oid = ${`public.${table}`}::regclass`;
        assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });
        await restricted(runtime, async tx => {
          const visible = await tx`select distinct tenant_id from ${tx(table)}`;
          assert.deepEqual([...visible], [{ tenant_id: homeTenant }]);
        });
        await restricted(
          runtime,
          async tx => {
            const visible = await tx`select distinct tenant_id from ${tx(table)}`;
            assert.deepEqual([...visible], [{ tenant_id: foreignTenant }]);
          },
          { home: foreignTenant }
        );
        for (const scope of [
          { home: foreignTenant, access: homeTenant },
          { access: foreignTenant },
        ]) {
          const invisible = await restricted(
            runtime,
            tx => tx`select tenant_id from ${tx(table)}`,
            scope
          );
          assert.equal(invisible.length, 0);
        }
      }

      await proveDeclarativeConstraints(connections, async tx => {
        const inserts = [
          {
            name: 'authority',
            run: (claimId: string) =>
              tx.savepoint(one =>
                insertGrant(one, {
                  ...grantInput(own.claim, own.doc, 'signed_assignment'),
                  claim_id: claimId,
                })
              ),
          },
          {
            name: 'correspondence',
            run: (claimId: string) =>
              tx.savepoint(one =>
                insertEntry(one, { ...inboundInput(own.claim), claim_id: claimId })
              ),
          },
          {
            name: 'sent document',
            run: (claimId: string) =>
              tx.savepoint(one => insertLink(one, { ...own.link, claim_id: claimId })),
          },
        ];
        for (const { name, run } of inserts) {
          await assert.rejects(
            run(other.claim.id),
            { code: '42501', message: /row-level security/u },
            name
          );
        }

        // The claim is visible to the access tenant. The split itself must still deny writes.
        await setScope(tx, { home: foreignTenant, access: homeTenant });
        for (const { name, run } of inserts) {
          await assert.rejects(
            run(own.claim.id),
            { code: '42501', message: /row-level security/u },
            name
          );
        }
      });
    }
  );

  await t.test(
    'composite FKs preserve actor, claim, authority, reply and document identity',
    async () => {
      const claim = await insertClaim(admin);
      const evidence = await restricted(runtime, tx => insertDocument(tx, documentInput(claim)));
      const recovery = grantInput(claim, evidence, 'signed_assignment');
      const representation = grantInput(claim, evidence, 'power_of_attorney');
      const inbound = inboundInput(own.claim);
      const outbound = { ...outboundInput(own.claim, own.bases, 1), decided_at: past };

      for (const table of registerTables) {
        const [fk] = await admin`select pg_get_constraintdef(oid) as definition from pg_constraint
        where conname = ${`${table}_claim_fk`} and conrelid = ${`public.${table}`}::regclass`;
        assert.equal(
          fk?.definition,
          'FOREIGN KEY (tenant_id, claim_id) REFERENCES claim(tenant_id, id)'
        );
      }

      await proveDeclarativeConstraints(connections, async tx => {
        for (const [suffix, grant] of [
          ['recorded_by', { ...recovery, recorded_by_staff_id: foreignActor }],
          ['revoked_by', { ...recovery, revoked_at: past, revoked_by_user_id: foreignActor }],
          [
            'jurisdiction_attested_by',
            { ...representation, jurisdiction_attested_by_user_id: foreignActor },
          ],
          ['evidence_document', { ...grantInput(claim, sameTenant.doc, 'signed_assignment') }],
          ['evidence_citation', { ...recovery, evidence_citation_ref: 'missing' }],
        ] as const) {
          // A different claim has the valid row/key, so an ID-only FK would accept these writes.
          await assert.rejects(
            tx.savepoint(one => insertGrant(one, grant)),
            foreignKey(`claim_authorities_${suffix}_fk`)
          );
        }
        for (const [suffix, entry] of [
          ['recorded_by', { ...inbound, recorded_by_staff_id: foreignActor }],
          ['sharing_attested_by', { ...outbound, sharing_attested_by_user_id: foreignActor }],
          ['reply', { ...inbound, in_reply_to_id: sameTenant.entry.id }],
          [
            'recovery_authority',
            { ...outbound, recovery_authority_id: sameTenant.bases.recovery.id },
          ],
          [
            'representation_authority',
            { ...outbound, representation_authority_id: sameTenant.bases.representation.id },
          ],
          ['sharing_authority', { ...outbound, sharing_authority_id: sameTenant.bases.sharing.id }],
        ] as const) {
          await assert.rejects(
            tx.savepoint(one => insertEntry(one, entry)),
            foreignKey(`claim_correspondence_${suffix}_fk`)
          );
        }
        await assert.rejects(
          tx.savepoint(one =>
            insertLink(one, { ...own.link, correspondence_id: sameTenant.entry.id })
          ),
          foreignKey('claim_correspondence_documents_correspondence_fk')
        );
        await assert.rejects(
          tx.savepoint(one => insertLink(one, linkInput(own.entry, sameTenant.doc))),
          foreignKey('claim_correspondence_documents_document_fk')
        );
        const anotherDocument = await insertDocument(tx, documentInput(own.claim));
        await assert.rejects(
          tx.savepoint(one =>
            insertLink(one, {
              ...linkInput(own.entry, anotherDocument),
              document_citation_ref: 'missing',
            })
          ),
          foreignKey('claim_correspondence_documents_citation_fk')
        );
      });
    }
  );

  await t.test(
    'correlations and sent-document keys are unique in their intended scope',
    async () => {
      const grant = grantInput(own.claim, own.doc, 'signed_assignment');
      await assert.rejects(
        restricted(runtime, tx =>
          insertGrant(tx, { ...grant, correlation_id: own.bases.recovery.correlation_id })
        ),
        unique('claim_authorities_correlation_uq')
      );
      await assert.rejects(
        restricted(runtime, tx =>
          insertEntry(tx, { ...inboundInput(own.claim), correlation_id: own.entry.correlation_id })
        ),
        unique('claim_correspondence_correlation_uq')
      );
      await assert.rejects(
        restricted(runtime, async tx => {
          await insertLink(tx, own.link);
        }),
        unique('claim_correspondence_documents_pk')
      );
      await restricted(
        runtime,
        async tx => {
          const foreignGrant = grantInput(other.claim, other.doc, 'signed_assignment');
          await insertGrant(tx, {
            ...foreignGrant,
            correlation_id: own.bases.recovery.correlation_id,
          });
          await insertEntry(tx, {
            ...inboundInput(other.claim),
            correlation_id: own.entry.correlation_id,
          });
        },
        { home: foreignTenant }
      );
    }
  );
}

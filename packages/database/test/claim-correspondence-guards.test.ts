import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import type postgres from 'postgres';

import {
  withRegisterDb,
  restricted,
  setScope,
  type Connection,
  assignedPath,
  createBases,
  documentInput,
  earlier,
  foreignActor,
  grantInput,
  homeActor,
  insertClaim,
  insertDocument,
  insertEntry,
  insertGrant,
  insertLink,
  linkInput,
  outboundInput,
  past,
  revoke,
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

const future = '9999-01-01T00:00:00.000Z';
const invalidBasis = { code: 'P1202' };
const invalidDocument = { code: 'P1203' };

test('WP-12 register guards enforce authority, provenance and immutable records', async t => {
  await withRegisterDb(t, connections => proveGuards(t, connections));
});

async function proveGuards(t: TestContext, connections: Connection) {
  const { admin, runtime, role } = connections;

  await t.test(
    'direct outbound INSERT requires each live, scoped, attested authorization',
    async () => {
      const claim = await insertClaim(admin);
      const foreignClaim = await insertClaim(admin);
      const { document, bases, expired } = await restricted(runtime, async tx => {
        const document = await insertDocument(tx, documentInput(claim));
        const foreignDocument = await insertDocument(tx, documentInput(foreignClaim));
        const bases = await createBases(tx, claim, document);
        const expired = await insertGrant(tx, {
          ...grantInput(foreignClaim, foreignDocument),
          granted_at: earlier,
          expires_at: past,
        });
        return { document, bases, expired };
      });
      const input = outboundInput(claim, bases);
      for (const [lesson, change] of [
        ['missing recovery', { recovery_authority_id: null }],
        ['missing representation', { representation_authority_id: null }],
        ['unknown recovery', { recovery_authority_id: randomUUID() }],
        ['wrong kind for recovery', { recovery_authority_id: bases.sharing.id }],
        ['wrong kind for representation', { representation_authority_id: bases.recovery.id }],
        ['recovery from another claim', { recovery_authority_id: expired.id }],
      ] as const) {
        await assert.rejects(
          restricted(runtime, tx => insertEntry(tx, { ...input, ...change })),
          invalidBasis,
          lesson
        );
      }
      const sharing = outboundInput(claim, bases, 1);
      await assert.rejects(
        restricted(runtime, tx => insertEntry(tx, { ...sharing, sharing_authority_id: null })),
        invalidBasis
      );
      await assert.rejects(
        restricted(runtime, tx =>
          insertEntry(tx, { ...sharing, sharing_authority_id: bases.recovery.id })
        ),
        invalidBasis
      );
      await assert.rejects(
        restricted(runtime, tx =>
          insertEntry(tx, { ...sharing, sharing_attested_by_user_id: null })
        ),
        invalidBasis
      );

      await assert.rejects(
        restricted(runtime, tx =>
          insertGrant(tx, {
            ...grantInput(claim, document, 'signed_assignment'),
            granted_at: future,
          })
        ),
        invalidBasis
      );

      // Model malformed legacy bases in the scratch transaction; the outbound guard stays enabled.
      for (const [constraint, patch] of [
        [null, { expires_at: '2020-01-02T00:00:00.000Z' }],
        [null, { granted_at: future }],
        ['claim_authorities_kind_scope_check', { scope: 'representation' }],
        ['claim_authorities_jurisdiction_check', { jurisdiction_attested_at: null }],
      ] as const) {
        await rolledBackProof(admin, async tx => {
          await tx`alter table claim_authorities disable trigger user`;
          if (constraint) await tx`alter table claim_authorities drop constraint ${tx(constraint)}`;
          const basis = 'jurisdiction_attested_at' in patch ? bases.representation : bases.recovery;
          const changed =
            await tx`update claim_authorities set ${tx(patch)} where id = ${basis.id} returning id`;
          assert.equal(changed.length, 1);
          await assumeRuntime(tx, role);
          await assert.rejects(
            tx.savepoint(one => insertEntry(one, input)),
            invalidBasis,
            Object.keys(patch)[0]
          );
        });
      }

      const [stored] = await restricted(runtime, async tx => {
        await insertEntry(tx, input);
        return tx`select decided_at from claim_correspondence where id = ${input.id}`;
      });
      assert.ok(stored.decided_at instanceof Date);
      assert.ok(stored.decided_at > new Date(past));
      await restricted(runtime, tx => revoke(tx, bases.recovery));
      await assert.rejects(
        restricted(runtime, tx => insertEntry(tx, outboundInput(claim, bases))),
        invalidBasis
      );
    }
  );

  await t.test(
    'the real insert honours a refusing jurisdiction rule and restores the original function',
    async () => {
      const claim = await insertClaim(admin);
      const bases = await restricted(runtime, async tx => {
        const evidence = await insertDocument(tx, documentInput(claim));
        return createBases(tx, claim, evidence);
      });
      const entry = outboundInput(claim, bases);
      await rolledBackProof(admin, async tx => {
        await tx`create or replace function public.claim_basis_jurisdiction_appropriate(
        p_tenant_id text, p_claim_id text, p_authority_id uuid
      ) returns boolean language sql stable security invoker as 'select false'`;
        await assumeRuntime(tx, role);
        await assert.rejects(
          tx.savepoint(one => insertEntry(one, entry)),
          invalidBasis
        );
      });
      assert.equal((await restricted(runtime, tx => insertEntry(tx, entry))).id, entry.id);
    }
  );

  await t.test('both citation guards require provenance and matching readable copies', async () => {
    const claim = await insertClaim(admin);
    const otherClaim = await insertClaim(admin);
    const { bases, evidence, otherDocument, badDocs } = await restricted(runtime, async tx => {
      const evidence = await insertDocument(tx, documentInput(claim));
      const another = await insertDocument(tx, documentInput(claim));
      const crossClaim = await insertDocument(tx, documentInput(otherClaim));
      const labels = [
        ['wrong assigned claim', (id: string) => assignedPath(otherClaim, id)],
        // The uploader's intake shape (storage-path.ts: initial): pii/tenants/{tenant}/claims/
        // {actor}/unassigned/{fileId}-{safeName}.
        [
          'another member intake',
          (id: string) =>
            `pii/tenants/${claim.tenant}/claims/${foreignActor}/unassigned/${id}-receipt.pdf`,
        ],
        [
          'same member intake',
          (id: string) =>
            `pii/tenants/${claim.tenant}/claims/${homeActor}/unassigned/${id}-receipt.pdf`,
        ],
        ['different file id', () => assignedPath(claim, randomUUID())],
      ] as const;
      const badDocs: [string, typeof evidence][] = [];
      for (const [label, path] of labels) {
        const id = randomUUID();
        const stored = await insertDocument(tx, documentInput(claim, id, path(id)));
        badDocs.push([label, stored]);
      }
      const wrongBucket = await insertDocument(tx, {
        ...documentInput(claim),
        bucket: 'another-bucket',
      });
      badDocs.push(['wrong storage bucket', wrongBucket], ['another claim document', crossClaim]);
      return {
        bases: await createBases(tx, claim, evidence),
        evidence,
        otherDocument: another,
        badDocs,
      };
    });

    async function rejectBoth(
      label: string,
      document: typeof evidence,
      copies = { bucket: document.bucket, file_path: document.file_path }
    ) {
      await assert.rejects(
        restricted(runtime, tx =>
          insertGrant(tx, {
            ...grantInput(claim, document, 'signed_assignment'),
            evidence_bucket: copies.bucket,
            evidence_file_path: copies.file_path,
          })
        ),
        invalidDocument,
        label
      );
      await assert.rejects(
        restricted(runtime, async tx => {
          const entry = await insertEntry(tx, outboundInput(claim, bases, 1));
          await insertLink(tx, {
            ...linkInput(entry, document),
            document_bucket: copies.bucket,
            document_file_path: copies.file_path,
          });
        }),
        invalidDocument,
        label
      );
    }

    for (const [label, document] of badDocs) await rejectBoth(label, document);
    await rejectBoth('readable bucket mismatch', evidence, {
      ...evidence,
      bucket: 'mismatched-bucket',
    });
    await rejectBoth('readable path mismatch', evidence, {
      ...evidence,
      file_path: 'mismatched-path',
    });
    // Redirection: the identity of one eligible document with the copies of another.
    await rejectBoth('readable copies of another eligible document', evidence, {
      bucket: otherDocument.bucket,
      file_path: otherDocument.file_path,
    });

    await restricted(runtime, async tx => {
      const grant = await insertGrant(tx, grantInput(claim, evidence, 'signed_assignment'));
      const entry = await insertEntry(tx, outboundInput(claim, bases, 1));
      await insertLink(tx, linkInput(entry, otherDocument));
      const [storedGrant] = await tx`select evidence_bucket, evidence_file_path
        from claim_authorities where id = ${grant.id}`;
      assert.deepEqual(storedGrant, {
        evidence_bucket: evidence.bucket,
        evidence_file_path: evidence.file_path,
      });
      const [storedLink] = await tx`select document_bucket, document_file_path
        from claim_correspondence_documents where correspondence_id = ${entry.id}`;
      assert.deepEqual(storedLink, {
        document_bucket: otherDocument.bucket,
        document_file_path: otherDocument.file_path,
      });
    });
  });
}

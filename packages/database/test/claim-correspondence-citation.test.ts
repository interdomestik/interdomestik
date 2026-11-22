import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test, { type TestContext } from 'node:test';

import {
  foreignKey,
  isolationLevels,
  restricted,
  type Connection,
  bucket,
  createBases,
  documentInput,
  foreignTenant,
  homeTenant,
  insertClaim,
  insertDocument,
  insertEntry,
  insertLink,
  linkInput,
  outboundInput,
  type Document,
  withRegisterDb,
} from './claim-correspondence.fixture';
const randomPath = () => randomBytes(3_000).toString('base64url');
const nearLimitId = () => `d${randomPath().slice(0, 2_649)}`;

function citationRef(document: Document) {
  const fields = [
    document.tenant_id,
    document.claim_id,
    document.id,
    document.bucket,
    document.file_path,
  ];
  const digests = fields.map(field => createHash('sha256').update(field, 'utf8').digest());
  return createHash('sha256').update(Buffer.concat(digests)).digest('hex');
}

test('WP-12 document citation keys under runtime access', async t => {
  await withRegisterDb(t, connections => proveCitationReference(t, connections));
});

async function proveCitationReference(t: TestContext, connections: Connection) {
  const { admin, runtime, peer } = connections;
  await t.test('old column list works for large uncited paths and near-limit ids', async () => {
    const claim = await insertClaim(admin);
    const documents = [
      documentInput(claim, undefined, randomPath()),
      documentInput(claim, nearLimitId()),
    ];
    for (const document of documents) {
      const stored = await restricted(runtime, tx => insertDocument(tx, document));
      assert.equal(stored.citation_ref, citationRef(document));
    }
  });

  await t.test(
    'citation trigger unconditionally replaces supplied values and runs last',
    async () => {
      const claim = await insertClaim(admin);
      const original = await restricted(runtime, tx => insertDocument(tx, documentInput(claim)));
      for (const supplied of ['incorrect reference', original.citation_ref]) {
        const document = documentInput(claim);
        const inserted = await restricted(runtime, tx => insertDocument(tx, document, supplied));
        assert.equal(inserted.citation_ref, citationRef(document));
        const [{ citation_ref }] = await restricted(
          runtime,
          tx => tx<{ citation_ref: string }[]>`
        update claim_documents set citation_ref = ${supplied} where id = ${document.id} returning citation_ref`
        );
        assert.equal(citation_ref, inserted.citation_ref);
      }
      const renamed = await restricted(
        runtime,
        tx => tx`
      update claim_documents set name = 'Recomputed after rename' where id = ${original.id}
      returning name, citation_ref`
      );
      assert.deepEqual(
        [...renamed],
        [{ name: 'Recomputed after rename', citation_ref: citationRef(original) }]
      );
      const triggers = await admin`
      select tgname, tgenabled, tgattr::text = '' and (tgtype & 20) = 20 as all_inserts_and_updates
        from pg_trigger
      where tgrelid = 'public.claim_documents'::regclass and (tgtype & 3) = 3
      order by tgname collate "C"`;
      assert.deepEqual(triggers.at(-1), {
        tgname: 'zz_claim_documents_citation_ref',
        tgenabled: 'O',
        all_inserts_and_updates: true,
      });
    }
  );

  await t.test('runtime cannot create a trigger or set replication mode', async () => {
    const [acl] = await runtime`select
      has_table_privilege(current_user, 'public.claim_documents', 'TRIGGER') as can_trigger,
      has_parameter_privilege(current_user, 'session_replication_role', 'SET') as can_set_replication_role`;
    assert.deepEqual(acl, { can_trigger: false, can_set_replication_role: false });
    await assert.rejects(runtime`set session_replication_role = replica`, { code: '42501' });
  });

  await t.test('temporary text and int4 domains cannot affect a stored reference', async () => {
    const claim = await insertClaim(admin);
    const document = documentInput(claim, undefined, randomPath());
    const [{ clean }] = await peer`select claim_document_citation_ref(
      ${document.tenant_id}, ${document.claim_id}, ${document.id}, ${document.bucket}, ${document.file_path}
    ) as clean`;
    const stored = await restricted(runtime, async tx => {
      await tx`create domain pg_temp."text" as pg_catalog.text check (value = 'shadow')`;
      await tx`create domain pg_temp."int4" as pg_catalog.int4 check (value = -1)`;
      await tx`set local search_path = pg_temp, public, pg_catalog`;
      const row = await insertDocument(tx, document);
      await tx`drop domain pg_temp."text", pg_temp."int4"`;
      return row.citation_ref;
    });
    assert.equal(stored, clean);
    assert.equal(stored, citationRef(document));
  });

  await t.test(
    'fixed vectors pin UTF-8, backslashes, field boundaries and digest order',
    async () => {
      const base = documentInput(
        { id: 'claim', tenant: 'tenant', user: 'user' },
        'id',
        'pii/x.pdf'
      );
      const vectors = [
        base,
        { ...base, file_path: 'pii/ë雪.pdf' },
        { ...base, file_path: String.raw`\160ii/x.pdf` },
        { ...base, bucket: `${base.bucket}p`, file_path: base.file_path.slice(1) },
        { ...base, claim_id: 'claimi', id: 'd' },
      ];
      const actual = [];
      for (const document of vectors) {
        const [row] = await runtime`select claim_document_citation_ref(
        ${document.tenant_id}, ${document.claim_id}, ${document.id}, ${document.bucket}, ${document.file_path}
      ) as reference`;
        assert.equal(row.reference, citationRef(document));
        actual.push(row.reference);
      }
      assert.equal(new Set(actual).size, vectors.length);
    }
  );

  await proveFrozenReferences(t, connections);
}

async function proveFrozenReferences(t: TestContext, { admin, runtime }: Connection) {
  await t.test(
    'citation FKs freeze evidence and sent documents across tenant contexts and isolation levels',
    async () => {
      const claim = await insertClaim(admin);
      const otherClaim = await insertClaim(admin);
      const { evidence, sent, uncited } = await restricted(runtime, async tx => {
        const evidence = await insertDocument(tx, documentInput(claim, nearLimitId()));
        const sent = await insertDocument(tx, documentInput(claim, nearLimitId()));
        const uncited = await insertDocument(tx, documentInput(claim));
        const bases = await createBases(tx, claim, evidence);
        const entry = await insertEntry(tx, outboundInput(claim, bases, 1));
        await insertLink(tx, linkInput(entry, sent));
        return { evidence, sent, uncited };
      });

      for (const isolation of isolationLevels) {
        for (const home of [homeTenant, foreignTenant]) {
          const scope = { home, access: homeTenant, isolation };
          if (home !== homeTenant) {
            await restricted(
              runtime,
              async tx => {
                const citations =
                  await tx`select id from claim_authorities where claim_id = ${claim.id}`;
                const documents =
                  await tx`select id from claim_documents where id = ${evidence.id}`;
                assert.equal(citations.length, 0);
                assert.equal(documents.length, 1);
              },
              scope
            );
          }
          for (const [document, citationFk, identityFk] of [
            [
              evidence,
              'claim_authorities_evidence_citation_fk',
              'claim_authorities_evidence_document_fk',
            ],
            [
              sent,
              'claim_correspondence_documents_citation_fk',
              'claim_correspondence_documents_document_fk',
            ],
          ] as const) {
            const path = document.file_path;
            for (const patch of [
              { bucket: 'other-bucket' },
              { file_path: `${path}.changed` },
              { bucket: `${bucket}${path[0]}`, file_path: path.slice(1) },
            ]) {
              await assert.rejects(
                restricted(
                  runtime,
                  tx => tx`update claim_documents set ${tx(patch)} where id = ${document.id}`,
                  scope
                ),
                foreignKey(citationFk),
                `${home}, ${isolation}: cited ${Object.keys(patch).join(' and ')}`
              );
            }
            await assert.rejects(
              restricted(
                runtime,
                tx =>
                  tx`update claim_documents set claim_id = ${otherClaim.id} where id = ${document.id}`,
                scope
              ),
              (error: unknown) => {
                const refusal = error as { code?: string; constraint_name?: string };
                return (
                  refusal.code === '23503' &&
                  (refusal.constraint_name === citationFk || refusal.constraint_name === identityFk)
                );
              }
            );
          }
          const file_path = randomPath();
          const [changed] = await restricted(
            runtime,
            tx => tx`
          update claim_documents set file_path = ${file_path} where id = ${uncited.id} returning citation_ref`,
            scope
          );
          assert.equal(changed?.citation_ref, citationRef({ ...uncited, file_path }));
        }
      }
    }
  );
}

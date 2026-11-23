import {
  actorId,
  admitted,
  authority,
  caller,
  claimId,
  db,
  ids,
  now,
  occurredAt,
  outboundInput,
  queryWhere,
  recorded,
  tenantId,
} from './case-register.test-support';
import {
  claimAuthorities,
  claimCorrespondence,
  claimCorrespondenceDocuments,
  claimDocuments,
  claims,
} from '@interdomestik/database';
import { describe, expect, it } from 'vitest';
import {
  recordOutboundCorrespondence,
  recordOutboundCorrespondenceInputSchema,
} from './correspondence';

const recovery = {
  id: ids.recovery,
  kind: 'recovery_agreement',
  scope: 'recovery',
  grantedAt: new Date(occurredAt),
  expiresAt: null,
  revokedAt: null,
};
const representation = {
  ...recovery,
  id: ids.representation,
  kind: 'power_of_attorney',
  scope: 'representation',
};
const sharing = {
  ...recovery,
  id: ids.sharing,
  kind: 'consent_or_lawful_basis',
  scope: 'document_sharing',
  purpose: 'Review the repair estimate',
};
const document = {
  id: 'document-1',
  bucket: 'claim-evidence',
  filePath: 'pii/tenants/tenant-1/claims/claim-1/document-1.pdf',
};
const outboundWithDocument = {
  ...outboundInput,
  sharedDocumentIds: [document.id],
  sharingAuthorityId: ids.sharing,
  sharingCoveredByConsentConfirmed: true,
};
const invalid = { ok: false, code: 'invalid' };
const conflict = { ok: false, code: 'conflict' };

describe('correspondence decisions', () => {
  it.each([
    ['missing or on another case', [recovery], []],
    ['revoked', [{ ...recovery, revokedAt: new Date(occurredAt) }, representation], []],
    [
      'expired at decision time',
      [{ ...recovery, expiresAt: new Date(now[0].now) }, representation],
      [],
    ],
    [
      'not granted yet',
      [{ ...recovery, grantedAt: new Date('2026-11-23T09:00:00Z') }, representation],
      [],
    ],
    ['wrong kind', [{ ...recovery, kind: 'signed_assignment' }, representation], []],
    ['wrong scope', [recovery, { ...representation, scope: 'recovery' }], []],
    ['jurisdiction rule refuses', [recovery, representation], [{ appropriate: false }]],
  ])('refuses an outbound record when a required basis is %s', async (_label, rows, ruling) => {
    db.results = [admitted, [], rows, now, ruling];
    expect(await recordOutboundCorrespondence(caller(), authority, outboundInput)).toEqual({
      ok: false,
      code: 'authority_invalid',
    });
    expect(queryWhere(2).params).toEqual([tenantId, claimId, ids.recovery, ids.representation]);
    expect(db.statements.some(item => item.kind === 'insert')).toBe(false);
  });

  it('requires consent and affirmative attestation to send documents and refuses off-case files', async () => {
    const session = caller();
    const input = { ...outboundWithDocument, sharingCoveredByConsentConfirmed: undefined };
    expect(await recordOutboundCorrespondence(session, authority, input)).toEqual(invalid);
    expect(
      await recordOutboundCorrespondence(session, authority, {
        ...outboundWithDocument,
        sharingAuthorityId: undefined,
      })
    ).toEqual(invalid);
    expect(db.transaction).not.toHaveBeenCalled();
    db.results = [admitted, [], [recovery, representation, sharing], []];
    expect(await recordOutboundCorrespondence(session, authority, outboundWithDocument)).toEqual({
      ok: false,
      code: 'document_invalid',
    });
    expect(queryWhere(3).params).toEqual([tenantId, claimId, document.id]);
    db.results = [admitted, [], [recovery, representation], [document], [{ eligible: true }], now];
    expect(await recordOutboundCorrespondence(session, authority, outboundWithDocument)).toEqual({
      ok: false,
      code: 'authority_invalid',
    });
  });

  it('locks claim, authorities and documents in order and records the outbound entry and link together', async () => {
    db.results = [
      admitted,
      [],
      [recovery, representation, sharing],
      [document],
      [{ eligible: true }],
      now,
      [{ appropriate: true }],
      [{ id: ids.outbound }],
    ];
    expect(await recordOutboundCorrespondence(caller(), authority, outboundWithDocument)).toEqual({
      ok: true,
      correspondenceId: ids.outbound,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.statements.filter(item => item.lock).map(({ table, lock }) => [table, lock])).toEqual(
      [
        [claims, 'update'],
        [claimAuthorities, 'update'],
        [claimDocuments, 'share'],
      ]
    );
    expect(db.statements.filter(item => item.kind === 'insert')).toEqual([
      expect.objectContaining({
        table: claimCorrespondence,
        values: expect.objectContaining({
          tenantId,
          sharingAttestedByUserId: actorId,
          recordedByStaffId: actorId,
          sharedDocumentCount: 1,
        }),
      }),
      expect.objectContaining({
        table: claimCorrespondenceDocuments,
        values: [
          expect.objectContaining({
            tenantId,
            correspondenceId: ids.outbound,
            claimDocumentId: document.id,
            documentFilePath: document.filePath,
          }),
        ],
      }),
    ]);
  });

  it('allows 20 shared document IDs and refuses 21', () => {
    const shared = (count: number) => ({
      ...outboundWithDocument,
      sharedDocumentIds: Array.from({ length: count }, (_, index) => `doc-${index}`),
    });
    expect(recordOutboundCorrespondenceInputSchema.safeParse(shared(20)).success).toBe(true);
    expect(recordOutboundCorrespondenceInputSchema.safeParse(shared(21)).success).toBe(false);
  });

  it('retries the entire outbound transaction once after a deadlock', async () => {
    const deadlock = new Error('Query failed', { cause: { code: '40P01' } });
    const run = db.transaction.getMockImplementation()!;
    db.transaction.mockImplementationOnce(async (...args) => {
      await run(...args);
      throw deadlock;
    });
    const transactionRows = [
      admitted,
      [],
      [recovery, representation],
      now,
      [{ appropriate: true }],
      [{ id: ids.outbound }],
    ];
    db.results = [...transactionRows, ...transactionRows];
    const session = caller();
    await expect(recordOutboundCorrespondence(session, authority, outboundInput)).resolves.toEqual({
      ok: true,
      correspondenceId: ids.outbound,
    });
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(db.statements.filter(row => row.table === claims && row.lock === 'update')).toHaveLength(
      2
    );
    db.transaction.mockRejectedValueOnce(deadlock).mockRejectedValueOnce(deadlock);
    await expect(recordOutboundCorrespondence(session, authority, outboundInput)).rejects.toBe(
      deadlock
    );
    expect(db.transaction).toHaveBeenCalledTimes(4);
  });

  it('replays outbound after a follow-up change and distinguishes a later request with a different payload', async () => {
    db.results = [admitted, [recorded], admitted, [recorded]];
    const session = caller();
    expect(await recordOutboundCorrespondence(session, authority, outboundInput)).toEqual({
      ok: true,
      correspondenceId: ids.outbound,
    });
    expect(
      await recordOutboundCorrespondence(session, authority, {
        ...outboundInput,
        body: 'Another contact',
      })
    ).toEqual(conflict);
    expect(db.statements).toHaveLength(4);
  });
});

import {
  actorId,
  admitted,
  authority,
  caller,
  claimId,
  db,
  followUpInput,
  ids,
  inboundInput,
  now,
  occurredAt,
  outboundInput,
  queryWhere,
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
  recordInboundCorrespondence,
  recordOutboundCorrespondence,
  setCorrespondenceFollowUp,
} from './correspondence';
import { listClaimCorrespondence } from './correspondence-read';

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
const recorded = {
  ...inboundInput,
  id: ids.outbound,
  occurredAt: new Date(occurredAt),
  recordedByStaffId: actorId,
  partyReference: null,
  partyContactName: null,
  followUpAt: new Date(occurredAt),
  direction: 'outbound',
  recoveryAuthorityId: ids.recovery,
  representationAuthorityId: ids.representation,
  sharingAuthorityId: null,
  sharedDocumentCount: 0,
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

  it('refuses inbound bases and replies outside the case or to inbound correspondence', async () => {
    const session = caller();
    expect(await recordInboundCorrespondence(session, authority, outboundInput)).toEqual(invalid);
    db.results = [admitted, [], []];
    expect(
      await recordInboundCorrespondence(session, authority, {
        ...inboundInput,
        inReplyToId: ids.inbound,
      })
    ).toEqual(invalid);
    expect(queryWhere(2).params).toEqual([tenantId, claimId, ids.inbound, 'outbound']);
    expect(db.statements.some(item => item.kind === 'insert')).toBe(false);
  });

  it('records and replays an inbound reply using only the same-case outbound link', async () => {
    const input = { ...inboundInput, inReplyToId: ids.outbound };
    const session = caller();
    db.results = [
      admitted,
      [],
      [{ id: ids.outbound }],
      now,
      [{ id: ids.inbound }],
      admitted,
      [{ ...recorded, id: ids.inbound, direction: 'inbound', inReplyToId: ids.outbound }],
    ];
    const success = { ok: true, correspondenceId: ids.inbound };
    expect(await recordInboundCorrespondence(session, authority, input)).toEqual(success);
    expect(await recordInboundCorrespondence(session, authority, input)).toEqual(success);
    expect(db.statements.filter(item => item.kind === 'insert')).toHaveLength(1);
  });

  it('lower-cases UUID inputs so an identical upper-case retry replays', async () => {
    const outbound = 'abcdef12-1234-4234-8234-abcdefabcdef';
    const correlation = 'fedcba98-1234-4234-8234-fedcbafedcba';
    const input = {
      ...inboundInput,
      correlationId: correlation.toUpperCase(),
      inReplyToId: outbound.toUpperCase(),
    };
    const session = caller();
    db.results = [
      admitted,
      [],
      [{ id: outbound }],
      now,
      [{ id: ids.inbound }],
      admitted,
      [
        {
          ...recorded,
          id: ids.inbound,
          correlationId: correlation,
          direction: 'inbound',
          inReplyToId: outbound,
        },
      ],
    ];
    const success = { ok: true, correspondenceId: ids.inbound };
    expect(await recordInboundCorrespondence(session, authority, input)).toEqual(success);
    expect(await recordInboundCorrespondence(session, authority, input)).toEqual(success);
    expect(db.statements.filter(item => item.kind === 'insert')).toHaveLength(1);
  });

  it('refuses a cross-case follow-up and detects a stale follow-up compare-and-set', async () => {
    const session = caller();
    db.results = [admitted, []];
    expect(await setCorrespondenceFollowUp(session, authority, followUpInput)).toEqual({
      ok: false,
      code: 'invalid_state',
    });
    expect(queryWhere(1).params).toEqual([tenantId, claimId, ids.outbound, 'outbound']);
    db.results = [admitted, [{ id: ids.outbound }], []];
    expect(await setCorrespondenceFollowUp(session, authority, followUpInput)).toEqual(conflict);
    expect(queryWhere(4).sql).toContain(
      '"claim_correspondence"."follow_up_at" is not distinct from $5::timestamptz'
    );
    expect(queryWhere(4).params).toEqual([tenantId, claimId, ids.outbound, 'outbound', null]);
  });

  it('leaves date alerting to the read and suppresses the replied and inbound entries', async () => {
    const base = {
      ...recorded,
      occurredAt: new Date(occurredAt),
      followUpAt: new Date(Date.now() - 60_000),
      createdAt: new Date(occurredAt),
    };
    db.results = [
      admitted,
      [{ total: 3 }],
      [
        base,
        { ...base, id: ids.recovery },
        { ...base, id: ids.inbound, direction: 'inbound', followUpAt: null },
      ],
      [{ inReplyToId: base.id }],
      [],
    ];
    const result = await listClaimCorrespondence(caller(), authority, {
      claimId,
      page: 1,
      perPage: 20,
    });
    expect(result.ok && result.entries.map(entry => [entry.answered, entry.overdue])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  it('reads one bounded page of the register and the links of that page only', async () => {
    const base = { ...recorded, occurredAt: new Date(occurredAt), createdAt: new Date(occurredAt) };
    db.results = [admitted, [{ total: 45 }], [base], [], []];
    const result = await listClaimCorrespondence(caller(), authority, {
      claimId,
      page: 3,
      perPage: 20,
    });
    expect(result).toMatchObject({ ok: true, page: 3, perPage: 20, total: 45 });
    expect(db.statements[2]).toMatchObject({ limit: 20, offset: 40 });
    expect(queryWhere(3).params).toEqual([tenantId, claimId, 'inbound', recorded.id]);
    expect(queryWhere(4).params).toEqual([tenantId, claimId, recorded.id]);
    expect(
      await listClaimCorrespondence(caller(), authority, { claimId, page: 1, perPage: 51 })
    ).toEqual({ ok: false, code: 'invalid' });
  });
});

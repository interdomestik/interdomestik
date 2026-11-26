import {
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
  recorded,
  tenantId,
} from './case-register.test-support';
import { describe, expect, it } from 'vitest';
import { recordInboundCorrespondence, setCorrespondenceFollowUp } from './correspondence';
import { listClaimCorrespondence } from './correspondence-read';

const invalid = { ok: false, code: 'invalid' };
const conflict = { ok: false, code: 'conflict' };

describe('correspondence replies, follow-ups and reads', () => {
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
      [], // seal insert
      [{ id: ids.inbound }],
      admitted,
      [{ ...recorded, id: ids.inbound, direction: 'inbound', inReplyToId: ids.outbound }],
    ];
    db.results.push([]); // exact-set replay lookup
    const success = { ok: true, correspondenceId: ids.inbound };
    expect(await recordInboundCorrespondence(session, authority, input)).toEqual(success);
    expect(await recordInboundCorrespondence(session, authority, input)).toEqual(success);
    const writes = db.statements.filter(item => item.kind === 'insert');
    expect(writes).toHaveLength(2);
    expect(writes[0]?.values).toMatchObject({
      documentCount: 0,
      correspondenceId: expect.any(String),
    });
    expect(writes[1]?.values).toMatchObject({
      id: (writes[0]?.values as { correspondenceId: string }).correspondenceId,
    });
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
      [], // seal insert
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
    db.results.push([]); // exact-set replay lookup
    const success = { ok: true, correspondenceId: ids.inbound };
    expect(await recordInboundCorrespondence(session, authority, input)).toEqual(success);
    expect(await recordInboundCorrespondence(session, authority, input)).toEqual(success);
    const writes = db.statements.filter(item => item.kind === 'insert');
    expect(writes).toHaveLength(2);
    expect(writes[0]?.values).toMatchObject({
      documentCount: 0,
      correspondenceId: expect.any(String),
    });
    expect(writes[1]?.values).toMatchObject({
      id: (writes[0]?.values as { correspondenceId: string }).correspondenceId,
    });
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
    expect(db.statements[3]?.kind).toBe('selectDistinct');
    expect(queryWhere(3).params).toEqual([tenantId, claimId, 'inbound', recorded.id]);
    expect(queryWhere(4).params).toEqual([tenantId, claimId, recorded.id]);
    expect(
      await listClaimCorrespondence(caller(), authority, { claimId, page: 1, perPage: 51 })
    ).toEqual({ ok: false, code: 'invalid' });
  });
});

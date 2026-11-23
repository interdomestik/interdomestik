import { PgDialect } from 'drizzle-orm/pg-core';
import {
  actorId,
  admitted,
  authority,
  caller,
  caseFieldsInput,
  claimId,
  db,
  grantInput,
  ids,
  now,
  occurredAt,
  queryWhere,
  tenantId,
} from './case-register.test-support';
import { claimDocuments, claims } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';
import { recordCaseAuthority, revokeCaseAuthority } from './case-authorities';
import { updateGreenCardCaseFields } from './green-card-case-fields';

const document = {
  id: 'document-1',
  bucket: 'claim-evidence',
  filePath: 'pii/tenants/tenant-1/claims/claim-1/document-1.pdf',
};
const invalid = { ok: false, code: 'invalid' };
const conflict = { ok: false, code: 'conflict' };

describe('case authority commands', () => {
  it('copies the assigned instrument and stamps the jurisdiction attestation from the session and database clock', async () => {
    db.results = [
      admitted,
      [],
      [document],
      [{ eligible: true }],
      now,
      [{ id: ids.representation }],
    ];
    const input = {
      ...grantInput,
      kind: 'power_of_attorney',
      jurisdictionCountryCode: 'DE',
      jurisdictionAppropriateConfirmed: true,
    };
    const session = caller();
    expect(
      await recordCaseAuthority(session, authority, {
        ...input,
        jurisdictionAppropriateConfirmed: false,
      })
    ).toEqual(invalid);
    expect(await recordCaseAuthority(session, authority, input)).toEqual({
      ok: true,
      authorityId: ids.representation,
    });
    expect(db.statements.filter(item => item.lock).map(({ table, lock }) => [table, lock])).toEqual(
      [
        [claims, 'update'],
        [claimDocuments, 'share'],
      ]
    );
    expect(db.statements.at(-1)?.values).toMatchObject({
      tenantId,
      recordedByStaffId: actorId,
      jurisdictionAttestedByUserId: actorId,
      jurisdictionAttestedAt: new Date(now[0].now),
      evidenceFilePath: document.filePath,
      evidenceBucket: document.bucket,
      scope: 'representation',
    });
  });

  it('refuses evidence outside the locked case and a future grant', async () => {
    const session = caller();
    db.results = [admitted, [], []];
    expect(await recordCaseAuthority(session, authority, grantInput)).toEqual({
      ok: false,
      code: 'document_invalid',
    });
    expect(queryWhere(2).params).toEqual([tenantId, claimId, document.id]);
    db.results = [admitted, [], [document], [{ eligible: true }], now];
    expect(
      await recordCaseAuthority(session, authority, {
        ...grantInput,
        grantedAt: '2026-11-23T09:00:00Z',
      })
    ).toEqual({ ok: false, code: 'authority_invalid' });
    expect(db.statements.some(item => item.kind === 'insert')).toBe(false);
  });

  it('replays an exact grant and refuses changed evidence details under the same correlation', async () => {
    const existing = {
      ...grantInput,
      id: ids.recovery,
      grantedAt: new Date(occurredAt),
      expiresAt: null,
      jurisdictionCountryCode: null,
      purpose: null,
      recordedByStaffId: actorId,
    };
    const session = caller();
    db.results = [admitted, [existing], admitted, [existing]];
    expect(await recordCaseAuthority(session, authority, grantInput)).toEqual({
      ok: true,
      authorityId: ids.recovery,
    });
    expect(
      await recordCaseAuthority(session, authority, { ...grantInput, version: '2026-2' })
    ).toEqual(conflict);
    expect(db.statements.some(item => item.kind === 'insert')).toBe(false);
  });

  it('refuses off-case revocation, treats zero changed rows as conflict and replays the original actor', async () => {
    const input = { claimId, authorityId: ids.recovery };
    const session = caller();
    db.results = [admitted, []];
    expect(await revokeCaseAuthority(session, authority, input)).toEqual({
      ok: false,
      code: 'authority_invalid',
    });
    expect(queryWhere(1).params).toEqual([tenantId, claimId, ids.recovery]);
    db.results = [admitted, [{ id: ids.recovery, revokedBy: null }], []];
    expect(await revokeCaseAuthority(session, authority, input)).toEqual(conflict);
    expect(queryWhere(4).sql).toContain('"claim_authorities"."revoked_at" is null');
    db.results = [
      admitted,
      [{ id: ids.recovery, revokedBy: 'other-admin' }],
      admitted,
      [{ id: ids.recovery, revokedBy: actorId }],
    ];
    expect(await revokeCaseAuthority(session, authority, input)).toEqual(conflict);
    expect(await revokeCaseAuthority(session, authority, input)).toEqual({
      ok: true,
      authorityId: ids.recovery,
    });
  });
});

describe('deadlock retry', () => {
  const deadlock = new Error('Query failed', { cause: { code: '40P01' } });
  const input = { claimId, authorityId: ids.recovery };

  it('runs a revocation once more after a deadlock abort and then succeeds', async () => {
    const session = caller();
    db.transaction.mockRejectedValueOnce(deadlock);
    db.results = [admitted, [{ id: ids.recovery, revokedBy: actorId }]];
    expect(await revokeCaseAuthority(session, authority, input)).toEqual({
      ok: true,
      authorityId: ids.recovery,
    });
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it('rethrows a second deadlock abort instead of retrying without end', async () => {
    const session = caller();
    db.transaction.mockRejectedValueOnce(deadlock).mockRejectedValueOnce(deadlock);
    await expect(revokeCaseAuthority(session, authority, input)).rejects.toBe(deadlock);
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry an authority grant', async () => {
    db.transaction.mockRejectedValueOnce(deadlock);
    await expect(recordCaseAuthority(caller(), authority, grantInput)).rejects.toBe(deadlock);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('case fields and guard failures', () => {
  it('refuses reassigned staff before writing and treats a lost conditional update as conflict', async () => {
    const session = caller();
    db.results = [[], admitted, []];
    expect(await updateGreenCardCaseFields(session, authority, caseFieldsInput)).toEqual({
      ok: false,
      code: 'forbidden',
    });
    expect(db.statements).toHaveLength(1);
    // Started from the defaults: an upsert that may only replace a row still at the defaults.
    expect(await updateGreenCardCaseFields(session, authority, caseFieldsInput)).toEqual(conflict);
    expect(db.statements[2]?.kind).toBe('insert');
    const defaultsOnly = new PgDialect().sqlToQuery(db.statements[2]!.conflictWhere!).sql;
    expect(defaultsOnly).toContain(
      '"claim_case_fields"."coverage_verification_status" = \'not_checked\''
    );
    expect(defaultsOnly).toContain('"claim_case_fields"."case_follow_up_at" is null');
  });

  it('updates case fields only while every field still equals the edited values', async () => {
    const session = caller();
    const expected = {
      ...caseFieldsInput.expected,
      insuranceProofReference: 'proof-00',
      caseFollowUpAt: '2026-11-21T09:00:00.000Z',
    };
    const { expected: _edited, ...savedFields } = caseFieldsInput;
    const saved = {
      ...savedFields,
      tenantId,
      caseFollowUpAt: null,
      updatedByStaffId: actorId,
      updatedAt: new Date(),
    };
    db.results = [admitted, [], admitted, [saved]];
    const input = { ...caseFieldsInput, expected };
    expect(await updateGreenCardCaseFields(session, authority, input)).toEqual(conflict);
    expect(db.statements[1]?.kind).toBe('update');
    expect(queryWhere(1).params).toEqual([
      tenantId,
      claimId,
      null,
      'proof-00',
      null,
      'not_checked',
      '2026-11-21T09:00:00.000Z',
    ]);
    expect(await updateGreenCardCaseFields(session, authority, input)).toEqual({
      ok: true,
      fields: {
        otherVehicleCountryCode: 'DE',
        insuranceProofReference: 'proof-01',
        outsideHandlingParty: 'Example bureau',
        coverageVerificationStatus: 'requested',
        caseFollowUpAt: null,
      },
    });
  });

  it.each([
    ['P1201', 'invalid_state'],
    ['P1202', 'authority_invalid'],
    ['P1203', 'document_invalid'],
    ['P1204', 'invalid'],
    ['P1205', 'conflict'],
  ])('maps the database guard %s through a driver error', async (code, expected) => {
    db.transaction.mockRejectedValueOnce(new Error('Query failed', { cause: { code } }));
    expect(await recordCaseAuthority(caller(), authority, grantInput)).toEqual({
      ok: false,
      code: expected,
    });
  });

  it('maps the pilot uniqueness conflict and rethrows unrelated database errors', async () => {
    const session = caller();
    db.transaction.mockRejectedValueOnce({
      code: '23505',
      constraint_name: 'claim_authorities_claim_kind_uq',
    });
    expect(await recordCaseAuthority(session, authority, grantInput)).toEqual(conflict);
    const error = { code: '23505', constraint_name: 'unexpected_index' };
    db.transaction.mockRejectedValueOnce(error);
    await expect(recordCaseAuthority(session, authority, grantInput)).rejects.toBe(error);
  });
});

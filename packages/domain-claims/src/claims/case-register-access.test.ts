import {
  actorId,
  admitted,
  authority,
  branchId,
  caller,
  caseFieldsInput,
  claimId,
  db,
  followUpInput,
  grantInput,
  ids,
  inboundInput,
  occurredAt,
  outboundInput,
  queryWhere,
  tenantId,
} from './case-register.test-support';
import { describe, expect, it } from 'vitest';
import { listCaseAuthorities, recordCaseAuthority, revokeCaseAuthority } from './case-authorities';
import {
  recordInboundCorrespondence,
  recordOutboundCorrespondence,
  setCorrespondenceFollowUp,
} from './correspondence';
import { getClaimCorrespondenceSummary, listClaimCorrespondence } from './correspondence-read';
import { getGreenCardCaseFields, updateGreenCardCaseFields } from './green-card-case-fields';

const writes = [
  [recordCaseAuthority, grantInput],
  [revokeCaseAuthority, { claimId, authorityId: ids.recovery }],
  [recordOutboundCorrespondence, outboundInput],
  [recordInboundCorrespondence, inboundInput],
  [setCorrespondenceFollowUp, followUpInput],
  [updateGreenCardCaseFields, caseFieldsInput],
] as const;
const fullReads = [listCaseAuthorities, listClaimCorrespondence, getGreenCardCaseFields] as const;
const commands = [...writes, ...fullReads.map(read => [read, { claimId }] as const)] as const;
const forbidden = { ok: false, code: 'forbidden' };

describe('register admission', () => {
  it.each(commands)(
    '%s denies missing sessions, foreign cases and injected context',
    async (command, input) => {
      const session = caller();
      expect(await command(null, authority, input)).toEqual(forbidden);
      expect(await command(session, null, input)).toEqual(forbidden);
      for (const injected of [
        { tenantId },
        { recordedByStaffId: actorId },
        { sharingAttestedAt: occurredAt },
      ]) {
        expect(await command(session, authority, { ...input, ...injected })).toEqual({
          ok: false,
          code: 'invalid',
        });
      }
      expect(db.transaction).not.toHaveBeenCalled();
      db.results = [[]];
      expect(await command(session, authority, input)).toEqual(forbidden);
      const where = queryWhere(0);
      expect(where.params).toEqual(expect.arrayContaining([tenantId, claimId, branchId, 'draft']));
      expect(db.statements).toHaveLength(1);
    }
  );

  it.each(writes)(
    '%s allows writes only for in-scope assigned staff and home administrators',
    async (command, input) => {
      for (const role of [
        'member',
        'agent',
        'branch_manager',
        'auditor',
        'global_support',
        'super_admin',
      ]) {
        expect(await command(caller(role), authority, input)).toEqual(forbidden);
      }
      expect(db.transaction).not.toHaveBeenCalled();
      db.results = [[]];
      expect(await command(caller(), authority, input)).toEqual(forbidden);
      expect(db.statements[0].lock).toBe('update');
      expect(queryWhere(0).sql).toContain('"claim"."staffId" =');
      expect(queryWhere(0).params).toContain(actorId);
    }
  );

  it.each(fullReads)(
    '%s exposes full content only to scoped staff and home administrators',
    async read => {
      for (const role of ['member', 'agent', 'branch_manager', 'auditor', 'global_support']) {
        expect(await read(caller(role), authority, { claimId })).toEqual(forbidden);
      }
      expect(db.transaction).not.toHaveBeenCalled();
      expect(
        await read(
          caller('super_admin', null, { tenantId: 'foreign', accessTenantId: 'foreign' }),
          authority,
          { claimId }
        )
      ).toEqual(forbidden);
      expect(
        await read(caller('staff', branchId, { accessTenantId: 'foreign' }), authority, { claimId })
      ).toEqual(forbidden);
      expect(db.transaction).not.toHaveBeenCalled();
    }
  );

  // Mirrors the full-content subset of admin claim visibility and exercises the staff query scope.
  it.each(['admin', 'tenant_admin', 'super_admin', 'staff'])(
    'admits a home %s to an empty register',
    async role => {
      expect(await listClaimCorrespondence(caller(role), authority, { claimId })).toEqual({
        ok: true,
        entries: [],
      });
      const where = queryWhere(0);
      expect(where.params).toEqual(expect.arrayContaining([tenantId, claimId, 'draft']));
      expect(where.params.includes(branchId)).toBe(role === 'staff');
    }
  );

  it('checks the session principal and authority purpose before entering the register', async () => {
    const nonSession = caller('staff', branchId, { purpose: 'claim-home-read' });
    expect(await listClaimCorrespondence(nonSession, authority, { claimId })).toEqual(forbidden);
    const stale = caller();
    expect(
      await listClaimCorrespondence({ user: { ...stale.user, branchId: 'foreign' } }, authority, {
        claimId,
      })
    ).toEqual(forbidden);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('branch summary checks scope before reading dates and serializes only the permitted keys', async () => {
    expect(
      await getClaimCorrespondenceSummary(caller('branch_manager', null), authority, { claimId })
    ).toEqual(forbidden);
    expect(await getClaimCorrespondenceSummary(caller(), authority, { claimId })).toEqual(
      forbidden
    );
    expect(db.transaction).not.toHaveBeenCalled();
    const manager = caller('branch_manager');
    db.results = [[]];
    expect(await getClaimCorrespondenceSummary(manager, authority, { claimId })).toEqual(forbidden);
    expect(queryWhere(0).params).toEqual(
      expect.arrayContaining([tenantId, claimId, branchId, 'draft'])
    );
    expect(db.statements).toHaveLength(1);
    db.results = [admitted, [{ occurredAt: new Date(occurredAt) }]];
    expect(await getClaimCorrespondenceSummary(manager, authority, { claimId })).toEqual({
      ok: true,
      summary: { total: 1, dates: [occurredAt] },
    });
  });
});

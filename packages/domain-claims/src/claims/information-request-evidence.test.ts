import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auditValues: vi.fn(),
  selectRows: [] as unknown[][],
  transaction: vi.fn(),
  updateRows: [] as unknown[][],
}));

vi.mock('@interdomestik/database', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database')>();
  return { ...actual, withTenantContext: h.transaction };
});

import { acknowledgeInformationRequestEvidence } from './information-request-evidence';

const input = {
  claimId: 'claim-1',
  requestId: '12345678-1234-4234-8234-123456789012',
  documentId: 'document-1',
};
const staffSession = { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } };
const acknowledgedAt = new Date('2026-09-17T10:00:00.000Z');

function query(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  };
  for (const name of ['from', 'where', 'for', 'limit']) chain[name] = () => chain;
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.selectRows = [[{ staffId: 'staff-1' }]];
  h.updateRows = [[{ acknowledgedAt }]];
  h.transaction.mockImplementation((_context, run) =>
    run({
      select: () => query(h.selectRows.shift() ?? []),
      update: () => ({
        set: () => ({
          where: () => ({ returning: () => query(h.updateRows.shift() ?? []) }),
        }),
      }),
      insert: () => ({ values: h.auditValues }),
    })
  );
  h.auditValues.mockResolvedValue(undefined);
});

describe('information request evidence acknowledgement', () => {
  it.each([
    null,
    { user: { ...staffSession.user, role: 'member' } },
    { user: { ...staffSession.user, role: 'branch_manager' } },
    { user: { ...staffSession.user, tenantId: null } },
  ])('denies unauthorized actors before database access', async session => {
    await expect(acknowledgeInformationRequestEvidence(session, input)).resolves.toEqual({
      success: false,
      error: 'access_denied',
    });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('records acknowledgement and a durable audit row for the assigned staff member', async () => {
    await expect(acknowledgeInformationRequestEvidence(staffSession, input)).resolves.toEqual({
      success: true,
      acknowledgedAt: acknowledgedAt.toISOString(),
    });
    expect(h.auditValues).toHaveBeenCalledOnce();
    expect(h.auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim_information_request.evidence_acknowledged',
        actorId: 'staff-1',
        actorRole: 'staff',
        entityId: input.requestId,
        metadata: { documentId: input.documentId },
        tenantId: 'tenant-1',
      })
    );
  });

  it('returns the original timestamp on retry without adding another audit row', async () => {
    h.updateRows = [[]];
    h.selectRows = [[{ staffId: 'staff-1' }], [{ acknowledgedAt }]];

    await expect(acknowledgeInformationRequestEvidence(staffSession, input)).resolves.toEqual({
      success: true,
      acknowledgedAt: acknowledgedAt.toISOString(),
    });
    expect(h.auditValues).not.toHaveBeenCalled();
  });

  it('denies a staff member who is not the current assignee', async () => {
    h.selectRows = [[{ staffId: 'staff-2' }]];

    await expect(acknowledgeInformationRequestEvidence(staffSession, input)).resolves.toEqual({
      success: false,
      error: 'access_denied',
    });
    expect(h.auditValues).not.toHaveBeenCalled();
  });

  it('reports a conflict when the evidence association no longer exists', async () => {
    h.updateRows = [[]];
    h.selectRows = [[{ staffId: 'staff-1' }], []];

    await expect(acknowledgeInformationRequestEvidence(staffSession, input)).resolves.toEqual({
      success: false,
      error: 'conflict',
    });
    expect(h.auditValues).not.toHaveBeenCalled();
  });
});

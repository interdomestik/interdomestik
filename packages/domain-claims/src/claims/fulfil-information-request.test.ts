import { beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as unknown[][],
  audit: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: h.transaction,
}));

import { fulfilInformationRequest } from './fulfil-information-request';

const requestId = '12345678-1234-4234-8234-123456789012';
const input = { claimId: 'claim-1', requestId, documentId: 'document-1', reviewed: true };
const session = { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } };
const fulfilledAt = new Date('2026-09-29T10:00:00.000Z');

function query(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  };
  for (const name of ['from', 'where', 'for', 'returning']) chain[name] = () => chain;
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [
    [{ staffId: 'staff-1' }],
    [{ status: 'open', fulfilledAt: null, fulfilledDocumentId: null }],
    [{ acknowledgedAt: fulfilledAt }],
  ];
  h.update.mockImplementation(() => ({
    set: () => ({ where: () => ({ returning: () => query([{ fulfilledAt }]) }) }),
  }));
  h.audit.mockResolvedValue(undefined);
  h.transaction.mockImplementation((_context, run) =>
    run({
      select: () => query(h.rows.shift() ?? []),
      update: h.update,
      insert: () => ({ values: h.audit }),
    })
  );
});

it.each([
  null,
  { user: { ...session.user, role: 'member' } },
  { user: { ...session.user, role: 'branch_manager' } },
  { user: { ...session.user, tenantId: null } },
])('denies non-staff before database access', async actor => {
  await expect(fulfilInformationRequest(actor, input)).resolves.toEqual({
    success: false,
    error: 'access_denied',
  });
  expect(h.transaction).not.toHaveBeenCalled();
});

it.each([
  { reviewed: false },
  { requestId: 'invalid' },
  { documentId: '' },
  { responsibleStaffId: 'someone-else' },
])('rejects invalid or injected input %j', async change => {
  await expect(fulfilInformationRequest(session, { ...input, ...change })).resolves.toEqual({
    success: false,
    error: 'invalid_input',
  });
  expect(h.transaction).not.toHaveBeenCalled();
});

it('requires the current assigned staff owner', async () => {
  h.rows = [[{ staffId: 'staff-2' }]];
  await expect(fulfilInformationRequest(session, input)).resolves.toEqual({
    success: false,
    error: 'access_denied',
  });
  expect(h.update).not.toHaveBeenCalled();
});

it('rejects a request without acknowledged exact linked evidence', async () => {
  h.rows[2] = [{ acknowledgedAt: null }];
  await expect(fulfilInformationRequest(session, input)).resolves.toEqual({
    success: false,
    error: 'conflict',
  });
  expect(h.update).not.toHaveBeenCalled();
});

it('writes one fulfilment event and replays the same document without writing again', async () => {
  await expect(fulfilInformationRequest(session, input)).resolves.toEqual({
    success: true,
    fulfilledAt: fulfilledAt.toISOString(),
  });
  expect(h.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'claim_information_request.fulfilled',
      actorId: 'staff-1',
      tenantId: 'tenant-1',
      metadata: { documentId: 'document-1' },
    })
  );

  h.rows = [
    [{ staffId: 'staff-1' }],
    [{ status: 'fulfilled', fulfilledAt, fulfilledDocumentId: 'document-1' }],
  ];
  h.audit.mockClear();
  h.update.mockClear();
  await expect(fulfilInformationRequest(session, input)).resolves.toEqual({
    success: true,
    fulfilledAt: fulfilledAt.toISOString(),
  });
  expect(h.update).not.toHaveBeenCalled();
  expect(h.audit).not.toHaveBeenCalled();
});

it('rejects a retry targeting a different document', async () => {
  h.rows = [
    [{ staffId: 'staff-1' }],
    [{ status: 'fulfilled', fulfilledAt, fulfilledDocumentId: 'document-2' }],
  ];
  await expect(fulfilInformationRequest(session, input)).resolves.toEqual({
    success: false,
    error: 'conflict',
  });
  expect(h.update).not.toHaveBeenCalled();
});

it.each([
  { tenantId: 'tenant-home', accessTenantId: 'tenant-access' },
  { tenantId: null, accessTenantId: 'tenant-access' },
])('uses the verified access tenant for assigned-staff writes %j', async tenant => {
  const actor = { user: { ...session.user, ...tenant } };
  const result = await fulfilInformationRequest(actor, input);
  expect(result.success).toBe(true);
  expect(h.transaction).toHaveBeenCalledWith(
    { tenantId: 'tenant-access', role: 'staff' },
    expect.any(Function)
  );
  expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-access' }));
});

it('denies whitespace-only tenant scope before any transaction', async () => {
  await expect(
    fulfilInformationRequest(
      { user: { ...session.user, tenantId: ' ', accessTenantId: ' ' } },
      input
    )
  ).resolves.toEqual({ success: false, error: 'access_denied' });
  expect(h.transaction).not.toHaveBeenCalled();
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ rows: [] as unknown[][], insert: vi.fn(), transaction: vi.fn() }));
vi.mock('@interdomestik/database', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database')>();
  return { ...actual, withTenantContext: h.transaction };
});
import {
  createInformationRequest,
  getInformationRequests,
  informationRequestInput,
} from './information-requests';

const session = { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } };
const input = {
  claimId: 'claim-1',
  correlationId: '12345678-1234-4234-8234-123456789012',
  requestedInformation: 'Repair estimate',
  explanationForMember: 'Needed to assess the damage.',
  dueAt: '2026-01-01T10:00:00.000Z',
};
const owned = { staffId: 'staff-1', caseState: 'verification', recoveryState: 'not_started' };
const existing = {
  ...input,
  id: 'request-1',
  createdByStaffId: 'staff-1',
  dueAt: new Date(input.dueAt),
};

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [[owned], [], [{ id: 'request-1' }]];
  const chain = () => {
    const rows = h.rows.shift() ?? [];
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    for (const name of [
      'from',
      'where',
      'for',
      'innerJoin',
      'leftJoin',
      'orderBy',
      'onConflictDoNothing',
      'returning',
    ])
      query[name] = () => query;
    return query;
  };
  h.insert.mockImplementation(() => ({ values: vi.fn(() => chain()) }));
  h.transaction.mockImplementation((_context, run) => run({ select: chain, insert: h.insert }));
});

describe('information request contract', () => {
  it.each([
    null,
    { user: { ...session.user, role: 'member' } },
    { user: { ...session.user, role: 'agent' } },
    { user: { ...session.user, role: 'branch_manager' } },
    { user: { ...session.user, tenantId: null } },
  ])('denies non-staff or missing tenant before database access', async actor => {
    expect(await createInformationRequest(actor, input)).toEqual({
      success: false,
      error: 'access_denied',
    });
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { dueAt: '' },
    { dueAt: '2026-02-30T10:00:00Z' },
    { dueAt: '2026-01-01T10:00' },
    { requestedInformation: ' ' },
    { explanationForMember: 'x'.repeat(1001) },
    { requestedInformation: 'a\u0000b' },
    { responsibleStaffId: 'other' },
    { correlationId: 'bad' },
  ])('rejects malformed or injected payload %j', async change => {
    expect(await createInformationRequest(session, { ...input, ...change })).toEqual({
      success: false,
      error: 'invalid_input',
    });
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it('accepts explicit past and distant future timestamps and exact text bound', () => {
    for (const dueAt of ['2000-01-01T00:00:00Z', '9999-12-31T23:59:59Z']) {
      expect(
        informationRequestInput.safeParse({
          ...input,
          dueAt,
          requestedInformation: 'x'.repeat(1000),
        }).success
      ).toBe(true);
    }
  });
  it.each([
    { claim: [] },
    { claim: [{ ...owned, staffId: 'other' }] },
    { claim: [{ ...owned, staffId: null }] },
  ])('requires exact current owner', async ({ claim }) => {
    h.rows = [claim];
    expect(await createInformationRequest(session, input)).toEqual({
      success: false,
      error: 'access_denied',
    });
    expect(h.insert).not.toHaveBeenCalled();
  });
  it.each(['draft', 'submitted', 'evaluation', 'resolved', 'rejected'])(
    'does not create with verification posture in %s',
    async caseState => {
      h.rows = [[{ ...owned, caseState }], []];
      expect(await createInformationRequest(session, input)).toEqual({
        success: false,
        error: 'invalid_state',
      });
      expect(h.insert).not.toHaveBeenCalled();
    }
  );
  it('creates in verification', async () => {
    expect(await createInformationRequest(session, input)).toEqual({
      success: true,
      requestId: 'request-1',
    });
    expect(h.insert).toHaveBeenCalledOnce();
  });
  it('replays canonical payload even after claim advances without another insert', async () => {
    h.rows = [[{ ...owned, caseState: 'evaluation' }], [existing]];
    expect(
      await createInformationRequest(session, {
        ...input,
        requestedInformation: ' Repair estimate ',
      })
    ).toEqual({ success: true, requestId: 'request-1' });
    expect(h.insert).not.toHaveBeenCalled();
  });
  it.each([
    { requestedInformation: 'Other' },
    { claimId: 'other' },
    { createdByStaffId: 'other' },
    { dueAt: new Date('2027-01-01') },
  ])('conflicts on reused correlation %j', async change => {
    h.rows = [[owned], [{ ...existing, ...change }]];
    expect(await createInformationRequest(session, input)).toEqual({
      success: false,
      error: 'conflict',
    });
  });
  it('resolves an insert conflict with the canonical persisted request', async () => {
    h.rows = [[owned], [], [], [existing]];
    expect(await createInformationRequest(session, input)).toEqual({
      success: true,
      requestId: 'request-1',
    });
  });
  it('denies unapproved read roles before querying', async () => {
    expect(
      await getInformationRequests({ user: { ...session.user, role: 'agent' } }, input.claimId)
    ).toEqual([]);
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it('groups request-linked evidence and derives explicit acknowledgement progress', async () => {
    h.rows = [
      [
        {
          requestId: 'request-1',
          requestedInformation: 'Repair estimate',
          explanationForMember: 'Needed to assess the damage.',
          dueAt: new Date('2026-01-01T10:00:00.000Z'),
          slaPosture: 'incomplete',
          createdAt: new Date('2025-12-01T10:00:00.000Z'),
          documentId: 'document-1',
          documentName: 'estimate.pdf',
          submittedAt: new Date('2025-12-02T10:00:00.000Z'),
          acknowledgedAt: new Date('2025-12-03T10:00:00.000Z'),
        },
      ],
    ];

    await expect(
      getInformationRequests(
        { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } },
        input.claimId
      )
    ).resolves.toEqual([
      {
        requestId: 'request-1',
        requestedInformation: 'Repair estimate',
        explanationForMember: 'Needed to assess the damage.',
        dueAt: '2026-01-01T10:00:00.000Z',
        slaPosture: 'incomplete',
        createdAt: '2025-12-01T10:00:00.000Z',
        evidence: [
          {
            documentId: 'document-1',
            documentName: 'estimate.pdf',
            submittedAt: '2025-12-02T10:00:00.000Z',
            acknowledgedAt: '2025-12-03T10:00:00.000Z',
          },
        ],
        progress: 'acknowledged',
      },
    ]);
  });
});

import { sponsorRevisionDecisions, sponsorTerms } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { auditTransaction, expectAudits } from './audit-test-support';
import { decideRevision, terminateTerm } from './decisions';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
const authority = mintTestTenantAuthority('tenant');
const actor = { userId: 'usr_staff', role: 'staff', branchId: null, agentTier: null };
const auditActor = { actorId: actor.userId, actorRole: actor.role };
function use(db: ReturnType<typeof auditTransaction>): void {
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
}
const revisionRows = [
  [{ termId: 'term', sponsorId: 'sponsor', revision: 1, createdBy: 'agent' }],
  [],
  [],
  [{ revision: 1 }],
];

describe('decision audit', () => {
  it.each(['approved', 'rejected'] as const)(
    'records %s on the revision without invoice text',
    async decision => {
      const db = auditTransaction({ selects: revisionRows });
      use(db);
      expect(
        (
          await decideRevision(authority, actor, {
            revisionId: 'revision',
            decision,
            invoiceReference: 'Private Name private@example.com',
          })
        ).ok
      ).toBe(true);
      expect(db.writes[0]?.table).toBe(sponsorRevisionDecisions);
      expectAudits(
        db,
        [
          {
            action: 'sponsor_revision.decided',
            entityType: 'sponsor_revision',
            entityId: 'revision',
            ...auditActor,
            metadata: { decision },
          },
        ],
        ['Private Name']
      );
    }
  );
  it('omits a conflicting decision', async () => {
    const db = auditTransaction({ selects: revisionRows, inserted: [[]] });
    use(db);
    expect(
      await decideRevision(authority, actor, {
        revisionId: 'revision',
        decision: 'approved',
        invoiceReference: null,
      })
    ).toEqual({ ok: false, error: 'conflict' });
    expectAudits(db, []);
  });
  it('omits a decision forbidden to its creator', async () => {
    const db = auditTransaction({
      selects: [[{ ...revisionRows[0]?.[0], createdBy: actor.userId }]],
    });
    use(db);
    expect(
      await decideRevision(authority, actor, {
        revisionId: 'revision',
        decision: 'approved',
        invoiceReference: null,
      })
    ).toEqual({ ok: false, error: 'forbidden' });
    expectAudits(db, []);
  });
});

describe('termination audit', () => {
  const input = {
    termId: 'term',
    now: new Date('2027-01-01T00:00:00.000Z'),
    effectiveAt: new Date('2027-02-01'),
  };
  function termRows(terminatedEffectiveAt: string | null): Record<string, unknown>[][] {
    return [
      [{ sponsorId: 'sponsor', createdBy: 'agent' }],
      [],
      [
        {
          id: 'term',
          termStart: '2027-01-01T00:00:00.000Z',
          termEnd: '2028-01-01T00:00:00.000Z',
          terminatedEffectiveAt,
        },
      ],
      [{ termId: 'term' }],
      [],
    ];
  }
  it('records the effective instant after the term update', async () => {
    const db = auditTransaction({ selects: termRows(null) });
    use(db);
    expect((await terminateTerm(authority, actor, input)).ok).toBe(true);
    expect(db.writes[0]?.table).toBe(sponsorTerms);
    expectAudits(db, [
      {
        action: 'sponsor_term.terminated',
        entityType: 'sponsor_term',
        entityId: 'term',
        ...auditActor,
        metadata: { at: input.effectiveAt.toISOString() },
      },
    ]);
  });
  it('does not audit a repeated termination', async () => {
    const db = auditTransaction({ selects: termRows(input.effectiveAt.toISOString()) });
    use(db);
    expect(await terminateTerm(authority, actor, input)).toEqual({ ok: false, error: 'conflict' });
    expectAudits(db, []);
  });
});

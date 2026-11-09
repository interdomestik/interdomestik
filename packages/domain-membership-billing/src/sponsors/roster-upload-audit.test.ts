import { sponsorRosterEntries } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { auditTransaction, expectAudits } from './audit-test-support';
import { rosterEmailHmac } from './roster-crypto';
import { uploadRoster } from './roster-upload';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
const authority = mintTestTenantAuthority('tenant');
const actor = { userId: 'usr_staff', role: 'staff', branchId: null, agentTier: null };
const auditActor = { actorId: actor.userId, actorRole: actor.role };
const secret = 'secret'.repeat(8);
const row = { firstName: 'PrivateFirst', lastName: 'PrivateLast', email: 'private@example.com' };
const scope = [
  [
    {
      sponsorId: 'sponsor',
      termStart: '2027-01-01T00:00:00.000Z',
      termEnd: '2028-01-01T00:00:00.000Z',
    },
  ],
  [{ branchId: 'branch', sourceLeadId: 'lead' }],
  [],
  [{ seatCount: 10 }],
  [{ agentId: 'agent' }],
  [{ listed: 0 }],
];
function use(db: ReturnType<typeof auditTransaction>): void {
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
}

describe('roster upload audit', () => {
  it('counts only fresh valid rows and audits each bound entry id in one batch', async () => {
    const db = auditTransaction({
      selects: [
        ...scope,
        [{ hmac: rosterEmailHmac(secret, 'existing@example.com') }],
        [{ id: 'member', email: row.email }],
        [
          {
            userId: 'member',
            sponsorId: 'sponsor',
            termStart: '2026-01-01T00:00:00.000Z',
            termEnd: '2027-01-01T00:00:00.000Z',
            terminatedEffectiveAt: null,
            revokedAt: null,
            decision: 'accepted',
          },
        ],
      ],
    });
    use(db);
    const result = await uploadRoster(authority, actor, {
      termId: 'term',
      secret,
      rows: [
        row,
        row,
        { ...row, email: 'existing@example.com' },
        { ...row, email: 'new@example.com' },
        { ...row, email: 'invalid' },
      ],
    });
    expect(result).toEqual({
      ok: true,
      value: { inserted: 2, bound: 1, alreadyListed: 1, duplicates: 1, invalid: 1 },
    });
    const write = db.writes[0];
    expect(write?.table).toBe(sponsorRosterEntries);
    const entries = Array.isArray(write?.values) ? write.values : [];
    const bound = entries.find(entry => entry.userId === 'member');
    expectAudits(
      db,
      [
        {
          action: 'sponsor_roster.list_uploaded',
          entityType: 'sponsor_term',
          entityId: 'term',
          ...auditActor,
          metadata: { count: 2, termId: 'term' },
        },
        {
          action: 'sponsor_roster.bound_at_upload',
          entityType: 'sponsor_roster_entry',
          entityId: String(bound?.id),
          ...auditActor,
          metadata: { termId: 'term' },
        },
      ],
      ['PrivateFirst', 'PrivateLast', secret]
    );
    expect(db.auditBatches()).toHaveLength(1);
  });
  it('records a successful zero-insert upload with count zero and no binding event', async () => {
    const db = auditTransaction({
      selects: [...scope, [{ hmac: rosterEmailHmac(secret, row.email) }]],
    });
    use(db);
    expect((await uploadRoster(authority, actor, { termId: 'term', secret, rows: [row] })).ok).toBe(
      true
    );
    expectAudits(db, [
      {
        action: 'sponsor_roster.list_uploaded',
        entityType: 'sponsor_term',
        entityId: 'term',
        ...auditActor,
        metadata: { count: 0, termId: 'term' },
      },
    ]);
  });
  it('does not audit a rejected upload over seat capacity', async () => {
    const db = auditTransaction({
      selects: [
        ...scope.slice(0, 3),
        [{ seatCount: 0 }],
        [{ agentId: 'agent' }],
        [{ listed: 0 }],
        [],
      ],
    });
    use(db);
    expect(await uploadRoster(authority, actor, { termId: 'term', secret, rows: [row] })).toEqual({
      ok: false,
      error: 'conflict',
    });
    expectAudits(db, []);
  });
  it.each(['agent', 'other-agent'])(
    'authorizes upload from lead ownership for %s',
    async userId => {
      const db = auditTransaction({
        selects: [...scope, [{ hmac: rosterEmailHmac(secret, row.email) }]],
      });
      use(db);
      const office = { userId, role: 'agent', branchId: 'branch', agentTier: 'office' };
      const result = await uploadRoster(authority, office, { termId: 'term', secret, rows: [row] });
      if (userId === 'agent') expect(result.ok).toBe(true);
      else expect(result).toEqual({ ok: false, error: 'forbidden' });
    }
  );
});

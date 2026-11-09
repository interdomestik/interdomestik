import { sponsors, sponsorTermRevisions, sponsorTerms } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { auditTransaction, expectAudits } from './audit-test-support';
import { addRevision, createSponsor, createTerm } from './terms';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
const actor = { userId: 'usr_staff', role: 'staff', branchId: null, agentTier: null };
const auditActor = { actorId: actor.userId, actorRole: actor.role };
const authority = mintTestTenantAuthority('tenant');
const revision = {
  seatCount: 10,
  pricePerSeatMinor: 100,
  currency: 'EUR',
  contractReference: 'Private Name',
  termsVersion: 'v1',
};
const scope = [[{ branchId: 'branch', leadId: 'lead' }], [{ agentId: 'agent' }]];
function use(db: ReturnType<typeof auditTransaction>): void {
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
}

const sponsorInput = {
  leadId: 'lead',
  legalName: 'Private Company',
  registrationNumber: null,
  taxNumber: null,
  billingContactName: 'Private Name',
  billingContactEmail: 'private@example.com',
};
const termInput = {
  sponsorId: 'sponsor',
  termStart: new Date('2027-01-01'),
  termEnd: new Date('2028-01-01'),
  legalEntityId: 'legal',
  planKey: 'plan',
  revision,
};

describe('sponsor creation audit', () => {
  it('records the acting user after inserting the sponsor, without contact data', async () => {
    const db = auditTransaction({
      selects: [[{ branchId: 'branch', agentId: 'agent', kind: 'company', status: 'new' }]],
    });
    use(db);
    const result = await createSponsor(authority, actor, sponsorInput);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected creation');
    expect(db.writes[0]?.table).toBe(sponsors);
    expectAudits(
      db,
      [
        {
          action: 'sponsor.created',
          entityType: 'sponsor',
          entityId: result.value.sponsorId,
          ...auditActor,
        },
      ],
      ['Private Company', 'Private Name']
    );
  });
  it('does not audit an insertion conflict', async () => {
    const db = auditTransaction({
      selects: [[{ branchId: 'branch', kind: 'company', status: 'new' }]],
      inserted: [[]],
    });
    use(db);
    expect(await createSponsor(authority, actor, sponsorInput)).toEqual({
      ok: false,
      error: 'conflict',
    });
    expectAudits(db, []);
  });
  it('propagates an audit failure through the same transaction', async () => {
    const db = auditTransaction({
      selects: [[{ branchId: 'branch', kind: 'company', status: 'new' }]],
      failAudit: true,
    });
    use(db);
    await expect(createSponsor(authority, actor, sponsorInput)).rejects.toThrow(
      'audit unavailable'
    );
  });
});

describe('term and revision creation audit', () => {
  it('batches the initial term and revision events after both inserts', async () => {
    const db = auditTransaction({ selects: [...scope, [{ tier: 'standard' }]] });
    use(db);
    const result = await createTerm(authority, actor, termInput);
    if (!result.ok) throw new Error('expected term');
    const { termId, revisionId } = result.value;
    expect(db.writes.slice(0, 2).map(write => write.table)).toEqual([
      sponsorTerms,
      sponsorTermRevisions,
    ]);
    expectAudits(
      db,
      [
        {
          action: 'sponsor_term.created',
          entityType: 'sponsor_term',
          entityId: termId,
          ...auditActor,
          metadata: { sponsorId: 'sponsor' },
        },
        {
          action: 'sponsor_revision.created',
          entityType: 'sponsor_revision',
          entityId: revisionId,
          ...auditActor,
          metadata: { termId },
        },
      ],
      ['Private Name']
    );
    expect(db.auditBatches()).toHaveLength(1);
  });
  it('records a subsequent revision after insertion', async () => {
    const db = auditTransaction({
      selects: [
        [{ sponsorId: 'sponsor' }],
        ...scope,
        [{ id: 'term' }],
        [{ revision: 1, seatCount: 10, decision: 'approved' }],
      ],
    });
    use(db);
    const result = await addRevision(authority, actor, { termId: 'term', revision });
    if (!result.ok) throw new Error('expected revision');
    expect(db.writes[0]?.table).toBe(sponsorTermRevisions);
    expectAudits(
      db,
      [
        {
          action: 'sponsor_revision.created',
          entityType: 'sponsor_revision',
          entityId: result.value.revisionId,
          ...auditActor,
          metadata: { termId: 'term' },
        },
      ],
      ['Private Name']
    );
  });
  it('does not audit an undecided existing revision', async () => {
    const db = auditTransaction({
      selects: [
        [{ sponsorId: 'sponsor' }],
        ...scope,
        [],
        [{ revision: 1, seatCount: 10, decision: null }],
      ],
    });
    use(db);
    expect(await addRevision(authority, actor, { termId: 'term', revision })).toEqual({
      ok: false,
      error: 'conflict',
    });
    expectAudits(db, []);
  });
});

import { memberLeads, sponsors } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi, type Mock } from 'vitest';

import type { SponsorActor } from './access';
import { auditTransaction } from './audit-test-support';
import { markLeftCompany } from './opt-out';
import { listSponsorsForActor, readSponsorRoster } from './roster-view';
import { createSponsor, createTerm } from './terms';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
const authority = mintTestTenantAuthority('tenant');
const staff: SponsorActor = { userId: 'staff', role: 'staff', branchId: null, agentTier: null };
const owner: SponsorActor = {
  userId: 'agent',
  role: 'agent',
  branchId: 'branch',
  agentTier: 'office',
};
const other: SponsorActor = { ...owner, userId: 'other-agent' };
type TestDb = ReturnType<typeof auditTransaction>;
function use(db: TestDb): void {
  vi.mocked(withTenantAuthority).mockImplementation(async (_authority, fn) => fn(db.tx));
}

function expectLeadJoin(db: TestDb, index = 0): void {
  const selection = vi.mocked(db.tx.select).mock.calls[index]?.[0];
  expect(selection).toMatchObject({ ownerAgentId: memberLeads.agentId });
  const chain = vi.mocked(db.tx.select).mock.results[index]?.value as unknown as {
    leftJoin: Mock;
    where: Mock;
  };
  expect(chain.leftJoin.mock.calls[0]?.[0]).toBe(memberLeads);
  const join = new PgDialect().sqlToQuery(chain.leftJoin.mock.calls[0]?.[1] as SQL).sql;
  expect(join).toContain('"member_leads"."tenant_id" = "sponsors"."tenant_id"');
  expect(join).toContain('"member_leads"."id" = "sponsors"."source_lead_id"');
}

describe('source company lead owns every sponsor scope', () => {
  it('keeps staff creation provenance while letting the lead agent see and manage terms', async () => {
    const created = auditTransaction({
      selects: [
        [
          {
            branchId: 'branch',
            agentId: owner.userId,
            kind: 'company',
            status: 'new',
          },
        ],
      ],
    });
    use(created);
    const creation = await createSponsor(authority, staff, {
      leadId: 'lead',
      legalName: 'Company',
      registrationNumber: null,
      taxNumber: null,
      billingContactName: 'Contact',
      billingContactEmail: 'contact@example.com',
    });
    if (!creation.ok) throw new Error('expected sponsor creation');
    const sponsorId = creation.value.sponsorId;
    expect(created.writes[0]).toMatchObject({
      table: sponsors,
      values: { id: sponsorId, sourceLeadId: 'lead', createdBy: staff.userId },
    });

    for (const actor of [owner, other]) {
      const listed = auditTransaction({
        selects: [
          [
            {
              id: sponsorId,
              legalName: 'Company',
              branchId: 'branch',
              createdBy: staff.userId,
              ownerAgentId: owner.userId,
            },
          ],
          [],
        ],
      });
      use(listed);
      const visible = await listSponsorsForActor(authority, actor);
      expect(visible).toEqual(
        actor === owner ? [{ sponsorId, legalName: 'Company', branchId: 'branch', terms: [] }] : []
      );
      expectLeadJoin(listed);
      const chain = vi.mocked(listed.tx.select).mock.results[0]?.value as unknown as {
        where: Mock;
      };
      const filter = new PgDialect().sqlToQuery(chain.where.mock.calls[0]?.[0] as SQL);
      expect(filter.sql).toContain('"member_leads"."agent_id" =');
      expect(filter.params).toContain(actor.userId);

      const term = auditTransaction({
        selects: [
          [{ branchId: 'branch', leadId: 'lead' }],
          [{ agentId: owner.userId }],
          [{ tier: 'standard' }],
        ],
      });
      use(term);
      const result = await createTerm(authority, actor, {
        sponsorId,
        termStart: new Date('2027-01-01'),
        termEnd: new Date('2028-01-01'),
        legalEntityId: 'legal',
        planKey: 'standard-year',
        revision: {
          seatCount: 1,
          pricePerSeatMinor: 100,
          currency: 'EUR',
          contractReference: 'contract',
          termsVersion: 'v1',
        },
      });
      if (actor === owner) expect(result).toMatchObject({ ok: true });
      else {
        expect(result).toEqual({ ok: false, error: 'forbidden' });
        expect(term.writes).toEqual([]);
      }
    }
  });

  it.each([owner, other])(
    'uses that same owner for left-company actions by $userId',
    async actor => {
      const db = auditTransaction({
        selects: [
          [
            {
              termId: 'term',
              branchId: 'branch',
              ownerAgentId: owner.userId,
              createdBy: staff.userId,
            },
          ],
          [{ id: 'approved' }],
        ],
        updated: [[{ id: 'entry' }]],
      });
      use(db);
      const result = await markLeftCompany(authority, actor, { entryId: 'entry', now: new Date() });
      expect(result).toEqual(
        actor === owner ? { ok: true, value: { marked: true } } : { ok: false, error: 'forbidden' }
      );
      expectLeadJoin(db);
      if (actor === other) expect(db.writes).toEqual([]);
    }
  );

  it('grants no agent ownership for a missing source lead, even to the creator', async () => {
    const row = {
      id: 'sponsor',
      legalName: 'Company',
      branchId: 'branch',
      ownerAgentId: null,
      createdBy: owner.userId,
    };
    const db = auditTransaction({ selects: [[row]] });
    use(db);
    expect(await listSponsorsForActor(authority, owner)).toEqual([]);
    expectLeadJoin(db);
    const roster = auditTransaction({ selects: [[row], []] });
    use(roster);
    expect(
      await readSponsorRoster(
        authority,
        owner,
        { hasCredential: vi.fn() },
        {
          termId: 'term',
          now: new Date(),
        }
      )
    ).toEqual({ ok: false, error: 'not_found' });
    expectLeadJoin(roster);
  });
});

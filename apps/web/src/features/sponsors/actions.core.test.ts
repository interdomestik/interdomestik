import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES } from '@interdomestik/shared-auth';
import { actionForm, context, roster, sponsor } from './test-fixtures';
import { runSponsorAction } from './actions.core';
import type { SponsorOperation } from './input.core';

const mocks = vi.hoisted(() => ({
  createSponsor: vi.fn(),
  createTerm: vi.fn(),
  addRevision: vi.fn(),
  decideRevision: vi.fn(),
  terminateTerm: vi.fn(),
  markLeftCompany: vi.fn(),
  uploadRoster: vi.fn(),
  list: vi.fn(),
  roster: vi.fn(),
  leads: vi.fn(),
  options: vi.fn(),
  gate: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: vi.fn() }));
vi.mock('@/app/[locale]/(agent)/agent/_layout.core', () => ({ getAgentTier: vi.fn() }));
vi.mock('./data.core', () => ({
  companyLeads: mocks.leads,
  termOptions: mocks.options,
  sponsorUploadEnabled: mocks.gate,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/terms', async original => ({
  ...(await original<typeof import('@interdomestik/domain-membership-billing/sponsors/terms')>()),
  createSponsor: mocks.createSponsor,
  createTerm: mocks.createTerm,
  addRevision: mocks.addRevision,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/decisions', async original => ({
  ...(await original<
    typeof import('@interdomestik/domain-membership-billing/sponsors/decisions')
  >()),
  decideRevision: mocks.decideRevision,
  terminateTerm: mocks.terminateTerm,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/opt-out', () => ({
  markLeftCompany: mocks.markLeftCompany,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/roster-upload', async original => ({
  ...(await original<
    typeof import('@interdomestik/domain-membership-billing/sponsors/roster-upload')
  >()),
  uploadRoster: mocks.uploadRoster,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/roster-crypto', async original => ({
  ...(await original<
    typeof import('@interdomestik/domain-membership-billing/sponsors/roster-crypto')
  >()),
  readSponsorRosterSecret: () => 'test-secret',
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/roster-view', () => ({
  listSponsorsForActor: mocks.list,
  readSponsorRoster: mocks.roster,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/sponsor-jobs', () => ({
  sponsorCredentialCheck: () => vi.fn(),
}));

const operations: SponsorOperation[] = [
  'createSponsor',
  'createTerm',
  'addRevision',
  'decideRevision',
  'terminateTerm',
  'uploadRoster',
  'markLeftCompany',
];
const writes = () => operations.map(operation => mocks[operation]);

beforeEach(() => {
  vi.clearAllMocks();
  writes().forEach(mock => mock.mockResolvedValue({ ok: true, value: {} }));
  mocks.uploadRoster.mockResolvedValue({
    ok: true,
    value: { inserted: 1, invalid: 1, duplicates: 1, alreadyListed: 0, bound: 0 },
  });
  mocks.list.mockResolvedValue([structuredClone(sponsor)]);
  mocks.roster.mockResolvedValue({ ok: true, value: roster });
  mocks.leads.mockResolvedValue([{ id: 'lead-1', label: 'Example' }]);
  mocks.options.mockResolvedValue({ plans: [{ id: 'plan-1' }], entities: [{ id: 'entity-1' }] });
  mocks.gate.mockResolvedValue(true);
});

describe('sponsor actions', () => {
  it.each([ROLES.auditor, ROLES.global_support, ROLES.member, ROLES.agent, 'unknown'])(
    'refuses every operation for %s',
    async role => {
      for (const operation of operations) {
        expect(
          await runSponsorAction(
            { ...context, actor: { ...context.actor, role, agentTier: 'field' } },
            operation,
            actionForm()
          )
        ).toEqual({ ok: false, error: 'forbidden' });
      }
      writes().forEach(mock => expect(mock).not.toHaveBeenCalled());
    }
  );
  it('refuses missing sessions and missing branches', async () => {
    for (const operation of operations) {
      expect(await runSponsorAction(null, operation, actionForm())).toEqual({
        ok: false,
        error: 'forbidden',
      });
      expect(
        await runSponsorAction(
          { ...context, actor: { ...context.actor, role: ROLES.branch_manager, branchId: null } },
          operation,
          actionForm()
        )
      ).toEqual({ ok: false, error: 'forbidden' });
    }
    writes().forEach(mock => expect(mock).not.toHaveBeenCalled());
  });
  it('refuses another branch at the action layer', async () => {
    mocks.list.mockResolvedValue([]);
    mocks.leads.mockResolvedValue([]);
    const otherBranch = {
      ...context,
      actor: { ...context.actor, role: ROLES.branch_manager, branchId: 'branch-2' },
    };
    for (const operation of operations)
      expect(await runSponsorAction(otherBranch, operation, actionForm())).toEqual({
        ok: false,
        error: 'forbidden',
      });
    writes().forEach(mock => expect(mock).not.toHaveBeenCalled());
  });
  it.each(operations.filter(operation => operation !== 'uploadRoster'))(
    'delegates %s with the authenticated authority',
    async operation => {
      const result = await runSponsorAction(context, operation, actionForm());
      expect(result.ok).toBe(true);
      expect(mocks[operation]).toHaveBeenCalledWith(
        context.authority,
        context.actor,
        expect.any(Object)
      );
    }
  );
  it.each(['approved', 'rejected'])('records the %s decision', async decision => {
    expect((await runSponsorAction(context, 'decideRevision', actionForm({ decision }))).ok).toBe(
      true
    );
    expect(mocks.decideRevision).toHaveBeenCalledWith(
      context.authority,
      context.actor,
      expect.objectContaining({ decision })
    );
  });
  it('uploads parsed rows and reports only company-visible counts', async () => {
    const form = actionForm();
    form.set('csv', new File(['firstName,lastName,email\nAda,One,ada@example.com'], 'list.csv'));
    // jsdom File lacks text(); the browser/server File implements it.
    const file = form.get('csv');
    if (file && typeof file !== 'string')
      Object.defineProperty(file, 'text', {
        value: async () => 'firstName,lastName,email\nAda,One,ada@example.com',
      });
    expect(await runSponsorAction(context, 'uploadRoster', form)).toEqual({
      ok: true,
      counts: { inserted: 1, invalid: 1, duplicates: 1, alreadyListed: 0 },
    });
    expect(mocks.uploadRoster).toHaveBeenCalledWith(context.authority, context.actor, {
      termId: 'term-1',
      secret: 'test-secret',
      rows: [{ firstName: 'Ada', lastName: 'One', email: 'ada@example.com' }],
    });
  });
  it('keeps only upload behind the switch', async () => {
    mocks.gate.mockResolvedValue(false);
    expect(await runSponsorAction(context, 'uploadRoster', actionForm())).toEqual({
      ok: false,
      error: 'dark',
    });
    expect((await runSponsorAction(context, 'markLeftCompany', actionForm())).ok).toBe(true);
    expect((await runSponsorAction(context, 'createTerm', actionForm())).ok).toBe(true);
    expect(mocks.uploadRoster).not.toHaveBeenCalled();
  });
  it.each(['decideRevision', 'terminateTerm'] as const)(
    'refuses %s by its creator',
    async operation => {
      const creator = { ...context, actor: { ...context.actor, userId: 'creator' } };
      expect(await runSponsorAction(creator, operation, actionForm())).toEqual({
        ok: false,
        error: 'forbidden',
      });
      expect(mocks[operation]).not.toHaveBeenCalled();
    }
  );
  it.each(['decideRevision', 'terminateTerm'] as const)(
    'refuses %s by agents and branch managers',
    async operation => {
      for (const role of [ROLES.agent, ROLES.branch_manager]) {
        expect(
          await runSponsorAction(
            { ...context, actor: { ...context.actor, role, agentTier: 'office' } },
            operation,
            actionForm()
          )
        ).toEqual({ ok: false, error: 'forbidden' });
      }
      expect(mocks[operation]).not.toHaveBeenCalled();
    }
  );
  it('rejects invalid revision, dates, foreign options and roster targets', async () => {
    expect(
      await runSponsorAction(context, 'addRevision', actionForm({ seatCount: '501' }))
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await runSponsorAction(context, 'createTerm', actionForm({ termStart: 'not-a-date' }))
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await runSponsorAction(context, 'createTerm', actionForm({ planKey: 'foreign' }))
    ).toEqual({ ok: false, error: 'invalid' });
    expect(
      await runSponsorAction(context, 'markLeftCompany', actionForm({ entryId: 'foreign' }))
    ).toEqual({ ok: false, error: 'forbidden' });
    expect(
      await runSponsorAction(
        context,
        'terminateTerm',
        actionForm({ effectiveAt: new Date().toISOString() })
      )
    ).toEqual({ ok: false, error: 'invalid' });
    writes().forEach(mock => expect(mock).not.toHaveBeenCalled());
  });
  it('refuses an approved contiguous successor and non-effective roster actions', async () => {
    const data = structuredClone(sponsor);
    const first = data.terms[0];
    if (!first) throw new Error('Missing fixture');
    data.terms.push({
      ...first,
      termId: 'successor',
      termStart: first.termEnd,
      termEnd: new Date('2032-01-01T00:00:00Z'),
    });
    mocks.list.mockResolvedValue([data]);
    expect(await runSponsorAction(context, 'terminateTerm', actionForm())).toEqual({
      ok: false,
      error: 'invalid',
    });
    first.effective = false;
    expect(await runSponsorAction(context, 'uploadRoster', actionForm())).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await runSponsorAction(context, 'markLeftCompany', actionForm())).toEqual({
      ok: false,
      error: 'forbidden',
    });
    writes().forEach(mock => expect(mock).not.toHaveBeenCalled());
  });
});

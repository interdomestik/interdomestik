import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type {
  SponsorView,
  RosterView,
} from '@interdomestik/domain-membership-billing/sponsors/roster-view';
import { ROLES } from '@interdomestik/shared-auth';
import type { SponsorContext } from './context.core';

export const context: SponsorContext = {
  authority: mintTestTenantAuthority('tenant-1'),
  actor: { userId: 'staff-1', role: ROLES.staff, branchId: 'branch-1', agentTier: null },
};
export const sponsor: SponsorView = {
  sponsorId: 'sponsor-1',
  legalName: 'Example Company',
  branchId: 'branch-1',
  terms: [
    {
      termId: 'term-1',
      termStart: new Date('2030-01-01T00:00:00Z'),
      termEnd: new Date('2031-01-01T00:00:00Z'),
      terminatedEffectiveAt: null,
      planKey: 'plan-1',
      createdBy: 'creator',
      effective: true,
      seatCount: 10,
      revisions: [
        {
          revisionId: 'revision-1',
          revision: 1,
          seatCount: 10,
          pricePerSeatMinor: 1000,
          currency: 'EUR',
          contractReference: 'contract-1',
          termsVersion: 'v1',
          createdBy: 'creator',
          decision: null,
          decidedBy: null,
        },
      ],
    },
  ],
};
export const term = sponsor.terms[0];
if (!term) throw new Error('Missing test term');
export const roster: RosterView = {
  sponsorId: sponsor.sponsorId,
  legalName: sponsor.legalName,
  term,
  counts: { registered: 1, awaiting_employee: 1, left_programme: 1 },
  entries: [
    {
      entryId: 'entry-1',
      firstName: 'Ada',
      lastName: 'One',
      email: 'roster1@example.com',
      status: 'registered',
      leftCompany: true,
    },
    {
      entryId: 'entry-2',
      firstName: 'Bert',
      lastName: 'Two',
      email: 'roster2@example.com',
      status: 'awaiting_employee',
      leftCompany: false,
    },
    {
      entryId: 'entry-3',
      firstName: 'Cora',
      lastName: 'Three',
      email: 'roster3@example.com',
      status: 'left_programme',
      leftCompany: false,
    },
  ],
};
export function actionForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  Object.entries({
    sponsorId: 'sponsor-1',
    termId: 'term-1',
    revisionId: 'revision-1',
    entryId: 'entry-1',
    leadId: 'lead-1',
    legalName: 'Example Company',
    registrationNumber: '',
    taxNumber: '',
    billingContactName: 'Alex',
    billingContactEmail: 'billing@example.com',
    termStart: '2030-01-01T00:00:00Z',
    termEnd: '2031-01-01T00:00:00Z',
    effectiveAt: '2030-06-01T00:00:00Z',
    legalEntityId: 'entity-1',
    planKey: 'plan-1',
    seatCount: '10',
    pricePerSeatMinor: '1000',
    currency: 'EUR',
    contractReference: 'contract-1',
    termsVersion: 'v1',
    decision: 'approved',
    invoiceReference: '',
    ...overrides,
  }).forEach(([key, value]) => form.set(key, value));
  return form;
}

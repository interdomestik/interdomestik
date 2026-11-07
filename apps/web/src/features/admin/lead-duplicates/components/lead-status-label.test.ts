import type { memberLeads } from '@interdomestik/database';
import { describe, expect, expectTypeOf, it } from 'vitest';

import en from '../../../../messages/en/admin-leads.json';
import mk from '../../../../messages/mk/admin-leads.json';
import sq from '../../../../messages/sq/admin-leads.json';
import sr from '../../../../messages/sr/admin-leads.json';
import { leadStatusLabelKey, MEMBER_LEAD_STATUSES } from './lead-status-label';

describe('leadStatusLabelKey', () => {
  it('covers exactly the stored member lead statuses', () => {
    type Stored = (typeof memberLeads.$inferSelect)['status'];
    expectTypeOf<(typeof MEMBER_LEAD_STATUSES)[number]>().toEqualTypeOf<Stored>();
  });

  it('gives every status, and an unexpected one, a translated label in each locale', () => {
    const values = [...MEMBER_LEAD_STATUSES, 'archived', ''];
    for (const catalog of [en, sq, mk, sr]) {
      const copy: Record<string, string> = catalog.admin.leads.duplicates;
      for (const status of values) {
        const label = copy[leadStatusLabelKey(status)];
        expect(label?.trim(), status).toBeTruthy();
        expect(label).not.toBe(status);
      }
    }
    expect(leadStatusLabelKey('payment_pending')).toBe('lead_status_payment_pending');
    expect(leadStatusLabelKey('archived')).toBe('lead_status_unknown');
  });
});

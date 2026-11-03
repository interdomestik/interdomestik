import { installCoreHooks } from './_core.entry.hooks.test-support';
import { mocks, renderPage } from './_core.entry.test-support';
import { screen } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

describe('member help support handoff form', () => {
  installCoreHooks();

  it('passes a targeted handoff id from the notification URL to the public response banner', async () => {
    await renderPage({ handoffId: 'handoff-1' });

    expect(screen.getByTestId('mock-member-support-handoff-public-response')).toHaveAttribute(
      'data-handoff-id',
      'handoff-1'
    );
    expect(mocks.publicResponseBanner).toHaveBeenCalledWith(
      expect.objectContaining({ handoffId: 'handoff-1' })
    );
  });

  it('passes through a claim-detail source hint from the search params', async () => {
    await renderPage({ claimId: 'claim-1', source: 'member_claim_detail' });

    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('claim-1');
    expect(document.querySelector('input[name="source"]')).toHaveValue('member_claim_detail');
    expect(document.querySelector('input[name="sourceClaimId"]')).toHaveValue('claim-1');
  });

  it('includes and preselects a valid owned claim outside the initial claim options', async () => {
    mocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          claimNumber: 'CLM-1',
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          id: 'claim-1',
          status: 'submitted',
          title: 'Claim one',
        },
      ])
      .mockResolvedValueOnce([
        {
          claimNumber: 'CLM-OLD',
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          id: 'claim-old',
          status: 'accepted',
          title: 'Older claim',
        },
      ]);

    await renderPage({ claimId: 'claim-old' });

    expect(screen.getByTestId('member-support-handoff-claim-context')).toHaveTextContent('CLM-OLD');
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('claim-old');
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveTextContent('CLM-OLD');
  });

  it('ignores an inaccessible claimId search param before submission', async () => {
    await renderPage({ claimId: 'claim-other-member', source: 'member_claim_detail' });

    expect(screen.queryByTestId('member-support-handoff-claim-context')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('');
    expect(document.querySelector('input[name="source"]')).toHaveValue('member_help');
    expect(document.querySelector('input[name="sourceClaimId"]')).not.toBeInTheDocument();
  });

  it('redirects non-member sessions to their canonical portal before rendering the form', async () => {
    mocks.getSessionSafe.mockResolvedValue({
      user: {
        id: 'agent-1',
        role: 'agent',
        tenantId: 'tenant-1',
      },
    });

    await expect(renderPage()).rejects.toThrow('redirect:/en/agent');
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

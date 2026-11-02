import { installCoreHooks } from './_core.entry.hooks.test-support';
import { mocks, renderPage } from './_core.entry.test-support';
import { screen } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

describe('member help support handoff form', () => {
  installCoreHooks();

  it('renders a member-created support handoff form without ownership inputs', async () => {
    await renderPage();

    expect(screen.getByTestId('member-page-ready')).toBeVisible();
    expect(mocks.advisoryBanner).toHaveBeenCalledWith({
      authority: expect.any(Object),
      memberId: 'member-1',
      selectedClaim: null,
    });
    expect(mocks.publicResponseBanner).toHaveBeenCalledWith({
      authority: expect.any(Object),
      handoffId: null,
      locale: 'en',
      memberId: 'member-1',
      selectedClaim: null,
    });
    expect(screen.getByTestId('member-support-handoff-form')).toBeVisible();
    expect(screen.getByTestId('member-support-handoff-subject')).toHaveAttribute('name', 'subject');
    expect(screen.getByTestId('member-support-handoff-message')).toHaveAttribute('name', 'message');
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveTextContent('CLM-1');
    expect(document.querySelector('input[name="source"]')).toHaveValue('member_help');
    expect(screen.queryByDisplayValue('tenant-1')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('member-1')).not.toBeInTheDocument();
  });

  it('shows the created acknowledgement after server action redirect', async () => {
    await renderPage({ support: 'created' });

    expect(screen.getByTestId('member-support-handoff-created')).toBeVisible();
  });

  it('preselects and displays a valid claim from the claimId search param', async () => {
    await renderPage({ claimId: 'claim-1' });

    expect(screen.getByTestId('member-support-handoff-claim-context')).toBeVisible();
    expect(screen.getByTestId('member-support-handoff-claim-title')).toHaveTextContent('CLM-1');
    expect(screen.getByTestId('member-support-handoff-claim-status')).toHaveTextContent(
      'request.claimContextStatus'
    );
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('claim-1');
  });

  it('places the public response and advisory after claim context without changing selected claim state', async () => {
    await renderPage({ claimId: 'claim-1' });

    const claimContext = screen.getByTestId('member-support-handoff-claim-context');
    const publicResponse = screen.getByTestId('mock-member-support-handoff-public-response');
    const advisory = screen.getByTestId('mock-member-support-handoff-advisory');
    const form = screen.getByTestId('member-support-handoff-form');

    expect(publicResponse).toHaveAttribute('data-selected-claim', 'claim-1');
    expect(advisory).toHaveAttribute('data-selected-claim', 'claim-1');
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('claim-1');
    expect(
      claimContext.compareDocumentPosition(publicResponse) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      publicResponse.compareDocumentPosition(advisory) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(advisory.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

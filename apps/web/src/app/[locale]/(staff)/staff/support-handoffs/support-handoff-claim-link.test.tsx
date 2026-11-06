import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SupportHandoffClaimLink } from './support-handoff-claim-link';

vi.mock('@/i18n/routing', async () => (await import('./_core.entry.test-support')).routingMock);

const claim = (status: string | null) => ({
  id: 'claim-1',
  claimNumber: 'CLM-XK-2026-000001',
  title: 'Claim title',
  status,
});

describe('SupportHandoffClaimLink', () => {
  it('links a submitted claim to its staff detail page', () => {
    render(
      <SupportHandoffClaimLink
        claim={claim('submitted')}
        fallbackLabel="Claim"
        noClaimLabel="None"
      />
    );
    const link = screen.getByTestId('staff-support-handoff-claim-link');
    expect(link).toHaveAttribute('href', '/staff/claims/claim-1');
    expect(link).toHaveTextContent('CLM-XK-2026-000001');
  });

  it('keeps a member draft as a label without a link staff could not open', () => {
    render(
      <SupportHandoffClaimLink claim={claim('draft')} fallbackLabel="Claim" noClaimLabel="None" />
    );
    expect(screen.queryByTestId('staff-support-handoff-claim-link')).toBeNull();
    expect(screen.getByTestId('staff-support-handoff-claim-draft')).toHaveTextContent(
      'CLM-XK-2026-000001'
    );
  });

  it('says there is no claim when the handoff has none', () => {
    render(<SupportHandoffClaimLink claim={null} fallbackLabel="Claim" noClaimLabel="None" />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });
});

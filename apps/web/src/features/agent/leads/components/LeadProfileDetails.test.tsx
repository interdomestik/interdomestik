import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { LeadProfileDetails } from './LeadProfileDetails';

const contact = { email: 'lead@example.com', phone: '+38344111222', branch: { name: 'Prishtina' } };

describe('LeadProfileDetails', () => {
  it('shows the company name and team size of a company lead (no longer kept in notes)', () => {
    render(
      <LeadProfileDetails
        lead={{ ...contact, leadKind: 'company', companyName: 'Fleet Sh.p.k.', teamSize: '11-25' }}
      />
    );
    expect(screen.getByTestId('lead-detail-company')).toHaveTextContent('company');
    expect(screen.getByTestId('lead-detail-company')).toHaveTextContent('Fleet Sh.p.k.');
    expect(screen.getByTestId('lead-detail-team-size')).toHaveTextContent('11-25');
    expect(screen.getByText('lead@example.com')).toBeInTheDocument();
    expect(screen.getByText('Prishtina')).toBeInTheDocument();
  });

  it('shows a dash for a company lead without a team size', () => {
    render(<LeadProfileDetails lead={{ ...contact, leadKind: 'company', companyName: 'Fleet' }} />);
    expect(screen.getByTestId('lead-detail-team-size')).toHaveTextContent('-');
  });

  it('keeps company rows off an individual lead', () => {
    render(<LeadProfileDetails lead={{ ...contact, leadKind: 'individual' }} />);
    expect(screen.queryByTestId('lead-detail-company')).toBeNull();
    expect(screen.queryByTestId('lead-detail-team-size')).toBeNull();
  });
});

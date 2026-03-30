import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BranchKpiBadge } from './branch-kpi-badge';

describe('BranchKpiBadge', () => {
  it('renders zero-value cash pending KPIs instead of hiding them', () => {
    render(<BranchKpiBadge type="cashPending" count={0} label="Cash pending" />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders zero-value SLA breach KPIs instead of hiding them', () => {
    render(<BranchKpiBadge type="slaBreaches" count={0} label="SLA breaches" />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('uses the localized KPI label for accessibility metadata', () => {
    render(<BranchKpiBadge type="openClaims" count={2} label="Отворени Штети" />);

    expect(screen.getByLabelText('Отворени Штети')).toBeInTheDocument();
    expect(screen.queryByLabelText('openClaims')).not.toBeInTheDocument();
  });
});

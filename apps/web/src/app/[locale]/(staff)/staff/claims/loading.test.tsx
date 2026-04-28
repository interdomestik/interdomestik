import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import StaffClaimsLoading from './loading';

describe('StaffClaimsLoading', () => {
  it('renders a deterministic loading contract for the staff claims queue', () => {
    render(<StaffClaimsLoading />);

    expect(screen.getByTestId('staff-claims-loading')).toBeInTheDocument();
  });
});

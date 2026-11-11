import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { verificationRequest } from '../../server/branch-manager-redaction.test-fixtures';
import { VerifierCell } from './VerifierCell';
describe('verification note presentation', () => {
  it('does not render a BM note or tooltip even with an unredacted input', () => {
    const { container } = render(
      <VerifierCell request={verificationRequest} viewerRole="branch_manager" />
    );
    expect(container.textContent).not.toContain('VERIFICATION-NOTE-SENTINEL');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it.each([
    'tenant_admin',
    'admin',
    'super_admin',
    'staff',
    'member',
    'agent',
    'global_support',
    'auditor',
  ])('keeps %s presentation unchanged', role => {
    render(<VerifierCell request={verificationRequest} viewerRole={role} />);
    expect(screen.getByText('VERIFICATION-NOTE-SENTINEL')).toBeInTheDocument();
  });
});

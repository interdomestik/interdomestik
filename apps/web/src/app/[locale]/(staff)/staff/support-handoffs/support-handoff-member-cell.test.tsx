import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SupportHandoffMemberCell, SupportHandoffMemberEmail } from './support-handoff-member-cell';

describe('SupportHandoffMemberEmail', () => {
  it('offers a line break right after "@" and keeps the full address as text and title', () => {
    render(<SupportHandoffMemberEmail email="member.ks.a1@plan070.example.invalid" />);

    const email = screen.getByTestId('staff-support-handoff-member-email');
    expect(email).toHaveTextContent('member.ks.a1@plan070.example.invalid');
    expect(email).toHaveAttribute('title', 'member.ks.a1@plan070.example.invalid');
    expect(email.innerHTML).toBe('member.ks.a1@<wbr>plan070.example.invalid');
  });

  it('renders a value without "@" unchanged and an empty cell for a missing email', () => {
    const { rerender } = render(<SupportHandoffMemberEmail email="no-at-sign" />);
    expect(screen.getByTestId('staff-support-handoff-member-email').innerHTML).toBe('no-at-sign');

    rerender(<SupportHandoffMemberEmail email={null} />);
    const empty = screen.getByTestId('staff-support-handoff-member-email');
    expect(empty).toBeEmptyDOMElement();
    expect(empty).not.toHaveAttribute('title');
  });

  it('renders the member cell with the number fallback and the breakable email', () => {
    render(
      <SupportHandoffMemberCell
        member={{ name: 'Arben Lula', memberNumber: null, email: 'a@b.example' }}
        noMemberNumberLabel="No member number"
      />
    );

    expect(screen.getByText('Arben Lula')).toBeInTheDocument();
    expect(screen.getByText('No member number')).toBeInTheDocument();
    expect(screen.getByTestId('staff-support-handoff-member-email').innerHTML).toBe(
      'a@<wbr>b.example'
    );
  });
});

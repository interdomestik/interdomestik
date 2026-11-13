import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  emailBreakSegments,
  SupportHandoffMemberCell,
  SupportHandoffMemberEmail,
} from './support-handoff-member-cell';
import { SUPPORT_HANDOFF_QUEUE_GRID } from './support-handoff-queue-grid';

describe('SupportHandoffMemberEmail', () => {
  it('offers line breaks only after "@" and domain dots, keeping the full address as text and title', () => {
    render(<SupportHandoffMemberEmail email="member.ks.a1@plan070.example.invalid" />);

    const email = screen.getByTestId('staff-support-handoff-member-email');
    expect(email).toHaveTextContent('member.ks.a1@plan070.example.invalid');
    expect(email).toHaveAttribute('title', 'member.ks.a1@plan070.example.invalid');
    expect(email.innerHTML).toBe('member.ks.a1@<wbr>plan070.<wbr>example.<wbr>invalid');
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
      'a@<wbr>b.<wbr>example'
    );
  });
});

describe('emailBreakSegments (qa3 #61)', () => {
  it('keeps the local part whole and splits the domain after each dot', () => {
    expect(emailBreakSegments('member.ks.a1@plan070.example.invalid')).toEqual([
      { start: 0, text: 'member.ks.a1@' },
      { start: 13, text: 'plan070.' },
      { start: 21, text: 'example.' },
      { start: 29, text: 'invalid' },
    ]);
  });

  it('leaves a value without a usable "@" as one segment', () => {
    expect(emailBreakSegments('no-at-sign')).toEqual([{ start: 0, text: 'no-at-sign' }]);
    expect(emailBreakSegments('@leading')).toEqual([{ start: 0, text: '@leading' }]);
  });
});

describe('support hand-off queue grid (qa3 #61)', () => {
  it('reflows to three columns below xl and gives the member column a minimum width at xl', () => {
    expect(SUPPORT_HANDOFF_QUEUE_GRID).toContain('md:grid-cols-3');
    expect(SUPPORT_HANDOFF_QUEUE_GRID).toMatch(
      /xl:grid-cols-\[minmax\(0,[\d.]+fr\)_minmax\(11rem,/
    );
    expect(SUPPORT_HANDOFF_QUEUE_GRID).not.toContain('md:grid-cols-6');
  });
});

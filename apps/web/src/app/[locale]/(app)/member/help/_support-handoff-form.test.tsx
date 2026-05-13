import { render, screen } from '@testing-library/react';
import type * as ReactModule from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMemberSupportHandoff: vi.fn(),
}));

vi.mock('@/actions/support-handoffs/create', () => ({
  createMemberSupportHandoff: mocks.createMemberSupportHandoff,
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({ children, ...props }: ReactModule.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import { MemberSupportHandoffForm } from './_support-handoff-form';

const labels = {
  claim: 'Claim',
  contactPreference: 'Contact preference',
  contactPreferenceEmail: 'Email',
  contactPreferencePhone: 'Phone',
  contactPreferenceStaffReply: 'Staff reply',
  contactPreferenceWhatsApp: 'WhatsApp',
  created: 'Support request created.',
  error: 'Unable to submit support request.',
  message: 'Message',
  noClaim: 'No claim',
  subject: 'Subject',
  submit: 'Submit',
};

describe('MemberSupportHandoffForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tenant-safe submission fields without ownership inputs', () => {
    render(
      <MemberSupportHandoffForm
        claimOptions={[
          {
            claimNumber: 'CLM-1',
            id: 'claim-1',
            status: 'submitted',
            title: 'Claim one',
          },
        ]}
        labels={labels}
        locale="mk"
        sourceClaimId="claim-1"
        selectedClaimId="claim-1"
      />
    );

    expect(screen.getByTestId('member-support-handoff-form')).toBeVisible();
    expect(screen.getByTestId('member-support-handoff-subject')).toHaveAttribute('name', 'subject');
    expect(screen.getByTestId('member-support-handoff-message')).toHaveAttribute('name', 'message');
    expect(screen.getByTestId('member-support-handoff-claim')).toHaveValue('claim-1');
    expect(document.querySelector('input[name="locale"]')).toHaveValue('mk');
    expect(document.querySelector('input[name="source"]')).toHaveValue('member_claim_detail');
    expect(document.querySelector('input[name="sourceClaimId"]')).toHaveValue('claim-1');
    expect(screen.queryByDisplayValue('tenant-1')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('member-1')).not.toBeInTheDocument();
  });

  it('keeps success and error acknowledgements on the redirected server page', () => {
    render(
      <MemberSupportHandoffForm
        claimOptions={[]}
        labels={labels}
        locale="mk"
        selectedClaimId={null}
        sourceClaimId={null}
      />
    );

    expect(screen.queryByTestId('member-support-handoff-created')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-support-handoff-submit-error')).not.toBeInTheDocument();
  });
});

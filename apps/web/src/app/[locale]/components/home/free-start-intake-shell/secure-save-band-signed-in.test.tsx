import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SecureSaveBand } from './secure-save-band';

// prettier-ignore
const secureCopy = {
  continuation: { body: 'Continue body', label: 'Continue saved draft', loading: 'Loading', failed: 'Failed', retry: 'Retry', back: 'Back' },
  eyebrow: 'Draft', heading: 'Guest secure save', body: 'Guest body', privacy: 'Privacy', save: 'Save securely',
  saveChanges: 'Save changes', startAnother: 'Start another',
  status: { idle: 'idle', saved: 'saved', dirty: 'dirty' },
  manage: { delete: 'Delete', emptyBody: 'None', emptyHeading: 'None', heading: 'Manage', inProgress: 'In progress',
    loadMore: 'More', loading: 'Loading', open: 'Manage drafts', ready: 'Ready', resume: 'Resume' },
  delete: { body: 'Body', cancel: 'Cancel', confirm: 'Delete', heading: 'Delete?' },
  otp: { body: 'Body', changeEmail: 'Change', codeLabel: 'Code', emailLabel: 'Email', heading: 'Verify',
    send: 'Send', sending: 'Sending', sent: 'Sent', verify: 'Verify', verifying: 'Verifying', errors: {} },
};

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = ((key: string) => key) as ((key: string) => string) & {
      raw: (key: string) => unknown;
    };
    t.raw = key =>
      JSON.stringify(
        key === 'secureSave'
          ? secureCopy
          : { accountContext: 'accountContext', invalid: 'invalid', unsupported: 'unsupported' }
      );
    return t;
  },
}));

function lifecycle(verified: boolean) {
  const noop = vi.fn();
  // prettier-ignore
  return { active: { id: 'draft-1', updatedAt: '2026-11-12T10:00:00.000Z', version: 1 }, hasUnsavedChanges: false,
    identityKey: 0, intent: null, items: [], loadMore: noop, nextCursor: null, onVerified: noop, openManage: noop,
    openSave: noop, remove: noop, resume: noop, saveChanges: noop, startAnother: noop, state: 'saved', verified };
}

describe('SecureSaveBand for a signed-in member', () => {
  it('hides only the guest prompt copy and keeps the account save, management and start-another', async () => {
    render(
      <SecureSaveBand
        hideGuestSave
        lifecycle={lifecycle(false) as never}
        locale="en"
        neutralOtpHost={globalThis.location.host}
      />
    );
    expect(await screen.findByTestId('free-start-start-another')).toBeVisible();
    expect(screen.getByTestId('free-start-manage-open')).toBeVisible();
    // For a signed-in member this button saves straight to the account (gate S3 journey).
    expect(screen.getByTestId('free-start-save-open')).toBeVisible();
    expect(screen.queryByText('Guest secure save')).not.toBeInTheDocument();
    expect(screen.queryByText('Guest body')).not.toBeInTheDocument();
  });

  it('keeps the guest save prompt for visitors', async () => {
    render(
      <SecureSaveBand
        lifecycle={lifecycle(false) as never}
        locale="en"
        neutralOtpHost={globalThis.location.host}
      />
    );
    await waitFor(() => expect(screen.getByTestId('free-start-save-open')).toBeVisible());
    expect(screen.getByText('Guest secure save')).toBeVisible();
    expect(screen.getByTestId('free-start-start-another')).toBeVisible();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EvidencePanel } from './EvidencePanel';

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string => {
      const values: Record<string, Record<string, string>> = {
        'admin.claims_page.evidence': {
          title: 'Evidence',
          upload_button: 'Upload',
          no_docs: 'No documents uploaded.',
        },
        common: {
          view: 'View',
        },
      };

      return values[namespace]?.[key] ?? `${namespace}.${key}`;
    },
}));

vi.mock('./AdminClaimEvidenceUploadDialog', () => ({
  AdminClaimEvidenceUploadDialog: ({ trigger }: { claimId: string; trigger: React.ReactNode }) => (
    <div>
      {trigger}
      <div data-testid="admin-evidence-upload-dialog">dialog-ready</div>
    </div>
  ),
}));

describe('EvidencePanel', () => {
  it('wires the upload header button to the admin upload dialog', () => {
    render(<EvidencePanel claimId="claim-1" docs={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(screen.getByTestId('admin-evidence-upload-dialog')).toBeInTheDocument();
  });
});

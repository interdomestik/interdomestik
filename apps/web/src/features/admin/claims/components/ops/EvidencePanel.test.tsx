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
          file_unavailable: 'File unavailable',
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
  it('marks unavailable documents while keeping valid download links', () => {
    render(
      <EvidencePanel
        claimId="claim-1"
        docs={[
          { id: 'bad', name: 'Old evidence', url: '' },
          { id: 'good', name: 'New evidence', url: 'https://example.test/signed' },
        ]}
      />
    );
    expect(screen.getByText('File unavailable')).toBeVisible();
    expect(screen.getByText('Old evidence')).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      'https://example.test/signed'
    );
  });

  it('wires the upload header button to the admin upload dialog', () => {
    render(<EvidencePanel claimId="claim-1" docs={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(screen.getByTestId('admin-evidence-upload-dialog')).toBeInTheDocument();
  });
});

import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemberClaimEvidenceSection } from './MemberClaimEvidenceSection';

vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => key,
}));
vi.mock('./ClaimEvidenceUploadDialog', () => ({
  ClaimEvidenceUploadDialog: ({
    claimId,
    trigger,
  }: Readonly<{ claimId: string; trigger: ReactNode }>) => (
    <div data-claim-id={claimId} data-testid="claim-evidence-upload-dialog">
      {trigger}
    </div>
  ),
}));
vi.mock('./MemberVaultConsentCard', () => ({ MemberVaultConsentCard: () => null }));

type Documents = Parameters<typeof MemberClaimEvidenceSection>[0]['documents'];
const renderSection = (documents: Documents = []) =>
  render(
    <MemberClaimEvidenceSection
      claimId="claim-1"
      documents={documents}
      vaultConsentDisplay={null as never}
    />
  );

describe('MemberClaimEvidenceSection', () => {
  it('gives the upload evidence trigger a 44px target at every width', () => {
    renderSection();

    const upload = screen.getByRole('button', { name: 'claimsPro.actions.uploadEvidence' });
    expect(upload).toHaveClass('min-h-11', 'text-foreground', 'bg-transparent');
    expect(upload).not.toHaveClass('sm:h-9', 'text-slate-900', 'hover:bg-slate-100');
    expect(within(screen.getByTestId('ops-documents-panel')).getByRole('button')).toBe(upload);
    expect(screen.getByTestId('claim-evidence-upload-dialog')).toHaveAttribute(
      'data-claim-id',
      'claim-1'
    );
  });

  it('shows the empty state under a level-two heading when no document exists', () => {
    renderSection();

    const panel = screen.getByTestId('ops-documents-panel');
    expect(within(panel).getByRole('heading', { level: 2, name: 'evidence' })).toBeInTheDocument();
    expect(within(panel).getByTestId('ops-documents-empty')).toHaveTextContent('documentsEmpty');
    expect(within(panel).queryByRole('list')).not.toBeInTheDocument();
    expect(within(panel).queryAllByTestId('ops-document-row')).toHaveLength(0);
  });

  it('lists each document with its name and a described inline view link, without a date', () => {
    renderSection([
      {
        id: 'doc-1',
        name: 'boarding-pass-with-a-very-long-name.pdf',
        category: 'evidence',
        createdAt: '2026-04-14T09:00:00.000Z',
        fileType: 'application/pdf',
        fileSize: 2048,
      },
      {
        id: 'doc-2',
        name: 'receipt.png',
        category: 'evidence',
        createdAt: '2026-04-15T09:00:00.000Z',
        fileType: 'image/png',
        fileSize: 512,
      },
    ]);

    const rows = screen.getAllByTestId('ops-document-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].tagName).toBe('LI');

    const first = within(rows[0]);
    const name = first.getByText('boarding-pass-with-a-very-long-name.pdf');
    const view = first.getByRole('link', { name: 'viewDocument' });
    expect(view).toHaveAttribute('href', '/api/documents/doc-1/download?disposition=inline');
    expect(view).toHaveAttribute('target', '_blank');
    expect(view).toHaveAttribute('rel', 'noopener noreferrer');
    expect(view).toHaveAttribute('aria-describedby', name.id);
    expect(view).toHaveAccessibleDescription('boarding-pass-with-a-very-long-name.pdf');
    expect(view).toHaveClass('min-h-11');
    expect(within(rows[1]).getByRole('link', { name: 'viewDocument' })).toHaveAccessibleDescription(
      'receipt.png'
    );

    // The member mapper backfills a missing upload time with the read time, so no date is shown.
    rows.forEach(row => expect(row.querySelector('time')).toBeNull());
    expect(screen.queryByText('14.04.2026')).not.toBeInTheDocument();
  });
});

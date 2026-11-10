import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count: number }) =>
    values ? `${key}: ${values.count}` : key,
}));
vi.mock('@/components/ops', async () => import('@/components/ops/OpsDocumentsPanel'));
vi.mock('./AdminClaimEvidenceUploadDialog', () => ({
  AdminClaimEvidenceUploadDialog: () => <button>Upload evidence</button>,
}));

import { EvidencePanel } from './EvidencePanel';

afterEach(cleanup);
const docs = [{ id: 'd', name: 'sensitive.pdf', url: 'https://storage.test/bearer' }];

describe('D1 evidence controls', () => {
  it('shows only allocation summary even if stale file metadata reaches a manager view', () => {
    render(
      <EvidencePanel
        claimId="claim-1"
        docs={docs}
        viewerRole="branch_manager"
        documentSummary={{ count: 2, evidenceComplete: null }}
      />
    );
    expect(screen.getByText('allocation_summary: 2')).toBeInTheDocument();
    expect(screen.queryByText('sensitive.pdf')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(['staff', 'admin', 'tenant_admin', 'super_admin'])('keeps %s document controls', role => {
    render(<EvidencePanel claimId="claim-1" docs={docs} viewerRole={role} />);
    expect(screen.getByText('sensitive.pdf')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', docs[0].url);
    expect(screen.getByRole('button', { name: 'Upload evidence' })).toBeInTheDocument();
  });
});

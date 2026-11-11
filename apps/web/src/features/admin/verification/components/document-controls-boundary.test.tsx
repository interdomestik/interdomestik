import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { CashVerificationRequestDTO } from '../server/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('@/components/ops', async () => ({
  ...(await import('@/components/ops/OpsDocumentsPanel')),
  OpsTable: ({ rows }: { rows: { id: string; cells: ReactNode[] }[] }) => (
    <>
      {rows.map(row => (
        <div key={row.id}>{row.cells}</div>
      ))}
    </>
  ),
  OpsStatusBadge: () => null,
  toOpsBadgeVariant: (status: string) => status,
}));

import { ProofCell } from './v2/ProofCell';
import { VerificationDocuments } from './VerificationDocuments';
import { VerificationTable } from './VerificationTable';

afterEach(cleanup);
const request = { documentId: 'd', documentPath: 'proof.pdf' } as CashVerificationRequestDTO;
const documents = [
  { id: 'd', name: 'proof.pdf', url: 'https://storage.test/bearer', uploadedAt: new Date() },
];

describe('D1 verification document controls', () => {
  it.each(['branch_manager', 'staff', 'admin'])(
    'gates the legacy proof cell for %s',
    viewerRole => {
      render(
        <VerificationTable
          data={[{ ...request, id: 'verification-1', amount: 0, currency: 'EUR' }]}
          historyMode={false}
          viewerRole={viewerRole}
          onViewDetails={vi.fn()}
          onVerify={vi.fn()}
          onAction={vi.fn()}
        />
      );
      expect(screen.queryAllByRole('link')).toHaveLength(viewerRole === 'branch_manager' ? 0 : 1);
    }
  );

  it('hides legacy history note tooltips for BM even with unredacted inputs', () => {
    const { container } = render(
      <VerificationTable
        data={[
          {
            ...request,
            id: 'verification-1',
            amount: 0,
            currency: 'EUR',
            verificationNote: 'NOTE-SENTINEL',
          },
        ]}
        historyMode
        viewerRole="branch_manager"
        onViewDetails={vi.fn()}
        onVerify={vi.fn()}
        onAction={vi.fn()}
      />
    );
    expect(container.textContent).not.toContain('NOTE-SENTINEL');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('hides proof open/download and drawer documents from a manager', () => {
    const { container } = render(
      <>
        <ProofCell request={request} viewerRole="branch_manager" />
        <VerificationDocuments documents={documents} viewerRole="branch_manager" />
      </>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['staff', 'admin', 'tenant_admin', 'super_admin'])(
    'preserves %s proof links',
    viewerRole => {
      render(
        <>
          <ProofCell request={request} viewerRole={viewerRole} />
          <VerificationDocuments documents={documents} viewerRole={viewerRole} />
        </>
      );
      expect(screen.getAllByRole('link')).toHaveLength(2);
      expect(screen.getByText('proof.pdf')).toBeInTheDocument();
    }
  );
});

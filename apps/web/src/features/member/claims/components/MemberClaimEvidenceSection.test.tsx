import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemberClaimEvidenceSection } from './MemberClaimEvidenceSection';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/ops', () => ({
  OpsDocumentsPanel: ({ headerActions }: Readonly<{ headerActions: ReactNode }>) => (
    <div>{headerActions}</div>
  ),
}));
vi.mock('@/components/ops/adapters/claims', () => ({ toOpsDocuments: () => [] }));
vi.mock('./ClaimEvidenceUploadDialog', () => ({
  ClaimEvidenceUploadDialog: ({ trigger }: Readonly<{ trigger: ReactNode }>) => trigger,
}));
vi.mock('./MemberVaultConsentCard', () => ({ MemberVaultConsentCard: () => null }));

describe('MemberClaimEvidenceSection', () => {
  it('gives the upload evidence trigger a 44px phone target and keeps the desktop height', () => {
    render(
      <MemberClaimEvidenceSection
        claimId="claim-1"
        documents={[]}
        vaultConsentDisplay={null as never}
      />
    );

    expect(screen.getByRole('button', { name: 'claimsPro.actions.uploadEvidence' })).toHaveClass(
      'h-11',
      'sm:h-9'
    );
  });
});

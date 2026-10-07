import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  fulfil: vi.fn(),
  refresh: vi.fn(),
  uploadSuccess: undefined as
    | ((evidence: { documentId: string; documentName: string; submittedAt: string }) => void)
    | undefined,
}));

vi.mock('@/actions/staff-claims/information-request', () => ({
  acknowledgeClaimInformationRequestEvidence: mocks.acknowledge,
  fulfilClaimInformationRequest: mocks.fulfil,
}));

vi.mock('@/features/member/claims/components/ClaimEvidenceUploadDialog', () => ({
  ClaimEvidenceUploadDialog: ({
    onUploadSuccess,
    trigger,
  }: {
    onUploadSuccess?: (evidence: {
      documentId: string;
      documentName: string;
      submittedAt: string;
    }) => void;
    trigger: React.ReactNode;
  }) => {
    mocks.uploadSuccess = onUploadSuccess;
    return trigger;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
export const { ClaimInformationRequests } = await import('./ClaimInformationRequests');
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
beforeEach(() => vi.clearAllMocks());
export const request = {
  requestId: '12345678-1234-4234-8234-123456789012',
  requestedInformation: '<script>estimate</script>',
  explanationForMember: 'Assessment detail',
  dueAt: '2000-01-01T00:00:00.000Z',
  status: 'open' as const,
  fulfilledAt: null,
  fulfilledDocumentId: null,
  slaPosture: 'incomplete' as const,
  createdAt: '2026-09-16T10:00:00.000Z',
  evidence: [],
  progress: 'awaiting_evidence' as const,
};

export { mocks };

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
const mocks = vi.hoisted(() => ({
  role: 'branch_manager',
  content: vi.fn(),
  metadata: vi.fn(),
  assignments: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: () => ({ principal: { role: mocks.role } }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('@/features/claims/timeline', () => ({ getClaimTimeline: mocks.content }));
vi.mock('@/features/admin/claims/server/get-claim-assignment-history', () => ({
  getClaimAssignmentHistory: mocks.assignments,
}));
vi.mock('./get-note-free-claim-timeline', () => ({ getNoteFreeClaimTimeline: mocks.metadata }));
vi.mock('./restricted-communication-notice', () => ({
  RestrictedCommunicationNotice: ({ state }: { state?: string }) => (
    <div>{state ?? 'restricted'}</div>
  ),
}));
vi.mock('./note-free-status-timeline', () => ({
  NoteFreeStatusTimeline: () => <div>status-metadata</div>,
}));
vi.mock('@/features/claims/timeline/components', () => ({
  ClaimTimeline: () => <div>normal-timeline</div>,
}));
vi.mock('@/features/admin/claims/components/detail/ClaimOpsTimeline', () => ({
  ClaimOpsTimeline: () => <div>normal-ops</div>,
}));
import { ClaimTimelineSection } from '@/features/claims/timeline/components/ClaimTimelineSection';
import { ClaimOpsTimelineSection } from '@/features/admin/claims/components/detail/ClaimOpsTimelineSection';
const params = {
  claimId: 'claim',
  authority: {} as TenantAuthority,
  viewerRole: 'admin' as const,
  showNotes: true,
  locale: 'sq',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = 'branch_manager';
  mocks.metadata.mockResolvedValue({ kind: 'ok', data: [] });
  mocks.content.mockResolvedValue({ claimId: 'claim', entries: [] });
  mocks.assignments.mockResolvedValue({ entries: [], truncated: false });
});
describe.each([ClaimTimelineSection, ClaimOpsTimelineSection])(
  'timeline trusted authority boundary',
  wrapper => {
    it('uses BM authority even with an admin presentation prop, never entering the frozen reader', async () => {
      render(await wrapper(params));
      expect(mocks.content).not.toHaveBeenCalled();
      expect(mocks.metadata).toHaveBeenCalledExactlyOnceWith({
        claimId: 'claim',
        authority: params.authority,
      });
      expect(screen.getByText('status-metadata')).toBeInTheDocument();
      expect(mocks.assignments).not.toHaveBeenCalled();
    });
    it('preserves non-BM reader inputs', async () => {
      mocks.role = 'tenant_admin';
      render(await wrapper(params));
      expect(mocks.metadata).not.toHaveBeenCalled();
      expect(mocks.content).toHaveBeenCalledExactlyOnceWith({
        claimId: 'claim',
        authority: params.authority,
        viewerRole: 'admin',
      });
    });
    it('reports failed reads without rendering a false empty history', async () => {
      mocks.metadata.mockResolvedValue({ kind: 'failed' });
      render(await wrapper(params));
      expect(screen.getByText('failed')).toBeInTheDocument();
      expect(screen.queryByText('status-metadata')).not.toBeInTheDocument();
      expect(mocks.content).not.toHaveBeenCalled();
    });
  }
);

describe('ops timeline assignment history boundary', () => {
  it('reads assignment history for the admin presentation with the page authority', async () => {
    mocks.role = 'tenant_admin';
    render(await ClaimOpsTimelineSection(params));
    expect(mocks.assignments).toHaveBeenCalledExactlyOnceWith({
      claimId: 'claim',
      authority: params.authority,
    });
  });
  it('never reads assignment history for a member presentation', async () => {
    mocks.role = 'tenant_admin';
    render(await ClaimOpsTimelineSection({ ...params, viewerRole: 'member' }));
    expect(mocks.content).toHaveBeenCalledOnce();
    expect(mocks.assignments).not.toHaveBeenCalled();
  });
});

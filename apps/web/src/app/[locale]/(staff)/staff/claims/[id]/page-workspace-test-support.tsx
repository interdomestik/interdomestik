import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import type { PublicInformationRequest } from '@interdomestik/domain-claims';

import { IntlHarness, message } from './page-workspace-request-fixture';

// Locale acceptance needs the real translator, not a global key-echo stub.
vi.unmock('next-intl');

/** Workspace section ids, in the order the mounted staff route is expected to render them. */
export const WORKSPACE_REGIONS = [
  'staff-claim-handling',
  'staff-claim-requests',
  'staff-claim-messages',
  'staff-claim-context',
  'staff-status-history',
] as const;
export type WorkspaceRegionId = (typeof WORKSPACE_REGIONS)[number];

const hoisted = vi.hoisted(() => ({
  locale: 'en',
  getInformationRequestsMock: vi.fn(
    (_session: unknown, _claimId: string): Promise<PublicInformationRequest[] | null> =>
      Promise.resolve([])
  ),
  getSessionMock: vi.fn((_context: string) =>
    Promise.resolve({
      user: {
        id: 'staff-1',
        tenantId: 'tenant-ks',
        role: 'staff',
        branchId: 'branch-a',
      },
    })
  ),
  getStaffClaimDetailMock: vi.fn(
    (_input: { branchId: string | null; claimId: string; staffId: string; tenantId: string }) =>
      Promise.resolve({
        claim: {
          id: 'claim-1',
          claimNumber: 'KS-0001',
          status: 'negotiation',
          staffId: 'staff-1',
          submittedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        member: {
          id: 'member-1',
          fullName: 'Member One',
          membershipNumber: 'MEM-001',
        },
        agent: {
          id: 'agent-1',
          name: 'Agent One',
        },
        matterAllowance: {
          allowanceTotal: 2,
          consumedCount: 0,
          remainingCount: 2,
        },
        acceptedRecoveryPrerequisites: null,
        commercialAgreement: null,
        recoveryDecision: null,
        successFeeCollection: null,
      })
  ),
  getPublicStatusHistoryCoreMock: vi.fn(
    (_input: {
      claimId: string;
      tenantId: string;
    }): Promise<
      Array<{ id: string; note: string | null; toStatus: string | null; createdAt: Date | null }>
    > => Promise.resolve([])
  ),
  getStaffAssignmentOptionsMock: vi.fn((_input: { branchId: string | null; tenantId: string }) =>
    Promise.resolve<Array<{ id: string; label: string }>>([])
  ),
  getMessagesForClaimCoreMock: vi.fn((_input: { session: unknown; claimId: string }) =>
    Promise.resolve({ success: true, messages: [] })
  ),
}));

// Server translation seam: `getTranslations` has no request scope under vitest, so this reads the
// real shipped catalogs for the locale the route set, including claim status copy.
vi.mock('next-intl/server', async () => {
  const { messagesFor } = await import('./page-workspace-request-fixture');
  const read = (locale: string, path: readonly string[]): unknown =>
    path.reduce<unknown>(
      (value, segment) =>
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      messagesFor(locale)
    );

  return {
    getTranslations: vi.fn((namespace?: string) =>
      Promise.resolve((key: string) => {
        const path = [...(namespace ? namespace.split('.') : []), ...key.split('.')];
        const value = read(hoisted.locale, path);
        // Keys outside these catalogs stay visible as keys, as next-intl itself falls back.
        return typeof value === 'string' ? value : path.join('.');
      })
    ),
    setRequestLocale: vi.fn((locale: string) => {
      hoisted.locale = locale;
    }),
  };
});

vi.mock('@/features/staff/claims/server/get-assigned-claim-documents', () => ({
  getAssignedStaffClaimDocuments: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error('notFound');
  },
}));

vi.mock('@/components/shell/session', () => ({
  getSessionSafe: hoisted.getSessionMock,
  requireSessionOrRedirect: (session: unknown) => session,
}));

vi.mock('@interdomestik/domain-claims', () => ({
  getInformationRequests: hoisted.getInformationRequestsMock,
  getStaffClaimDetail: hoisted.getStaffClaimDetailMock,
}));

vi.mock('./_core', () => ({
  getPublicStatusHistoryCore: hoisted.getPublicStatusHistoryCoreMock,
}));

vi.mock('@/features/staff/claims/assignment-options', () => ({
  getStaffAssignmentOptions: hoisted.getStaffAssignmentOptionsMock,
}));

vi.mock('@/actions/messages/get.core', () => ({
  getMessagesForClaimCore: hoisted.getMessagesForClaimCoreMock,
}));

// Action/messaging composition only; their writers are proven by their own suites. The request
// card itself stays real, so its localized duty copy is exercised here.
vi.mock('@/components/staff/claim-action-panel', () => ({
  ClaimActionPanel: () => <div data-testid="staff-claim-action-panel" />,
}));

vi.mock('@/components/messaging/messaging-panel', () => ({
  MessagingPanel: () => <div data-testid="staff-claim-messaging-panel" />,
}));

import StaffClaimDetailsPage from './page';

export async function renderWorkspacePage(locale = 'en') {
  const page = await StaffClaimDetailsPage({ params: Promise.resolve({ locale, id: 'claim-1' }) });
  render(<IntlHarness locale={locale}>{page}</IntlHarness>);
}

export async function mockClaimOnce({
  status = 'negotiation',
  staffId = 'staff-1',
}: { status?: string; staffId?: string } = {}) {
  const detail = await hoisted.getStaffClaimDetailMock.getMockImplementation()!({
    branchId: 'branch-a',
    claimId: 'claim-1',
    staffId: 'staff-1',
    tenantId: 'tenant-ks',
  });
  hoisted.getStaffClaimDetailMock.mockResolvedValueOnce({
    ...detail,
    claim: { ...detail.claim, staffId, status },
  });
}

export function sectionLinks(): string[] {
  return screen
    .queryAllByTestId('staff-claim-workspace-nav-link')
    .map(link => link.dataset.section ?? '');
}

/** The route owns these section ids; panel markers inside them are the shipped data-testids. */
export function regionNode(id: WorkspaceRegionId): HTMLElement {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Expected workspace section #${id} to be mounted`);
  }
  return node;
}

export function regionOrder(): WorkspaceRegionId[] {
  return WORKSPACE_REGIONS.flatMap(id => {
    const node = document.getElementById(id);
    return node ? [{ id, node }] : [];
  })
    .sort((a, b) =>
      a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    )
    .map(entry => entry.id);
}

export function requestsRegion() {
  return within(regionNode('staff-claim-requests'));
}

/** Reads the shipped route catalog so assertions cannot drift from real localized copy. */
export function claimText(locale: string, key: string): string {
  return message(locale, `agent-claims.claims.${key}`);
}

export {
  ACKNOWLEDGE_COPY,
  LOAD_ERROR_COPY,
  LOCALES,
  MEMBER_DUTY_COPY,
  REQUEST_DUTY_COPY,
  REQUEST_FIXTURES,
  TEST_TIME_ZONE,
  fulfilledRequest,
  message,
  openRequest,
  submittedRequest,
} from './page-workspace-request-fixture';
export type { RequestFixtureName, WorkspaceLocale } from './page-workspace-request-fixture';
export { hoisted };

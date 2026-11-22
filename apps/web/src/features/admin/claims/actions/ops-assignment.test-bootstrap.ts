import { vi } from 'vitest';

import { opsActionBoundaryMocks } from './ops-assignment.test-fixture';

// Shared module mocks for the assignOwner action suites. Actions load through explicit awaited
// imports below after mock registration. Suites import actions and assignment constants from
// here, so a static re-export cannot capture an uninitialized action binding.
const mocks = { ...opsActionBoundaryMocks, directDbAccess: [] as string[] };
vi.mock('@/lib/audit.core', () => ({
  writeAuditEvent: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@interdomestik/domain-claims/claims/transition-guard', () => ({
  isClaimStatusTransitionInGraph: () => true,
}));
vi.mock('./ops-status-action', () => ({ updateStatusAction: vi.fn() }));
vi.mock('@interdomestik/database', async () => {
  const fixture = await import('./ops-assignment.test-fixture');
  return fixture.createDatabaseModuleMock(mocks.withTenantContext, mocks.directDbAccess);
});

const { assignOwner, unassignOwner } = await import('./ops-actions');
const { ASSIGNMENT_CONFLICT_ERROR, ASSIGNMENT_DRAFT_ERROR, ASSIGNMENT_TARGET_DENIED_ERROR } =
  await import('./ops-assignment-errors');

export {
  ASSIGNMENT_CONFLICT_ERROR,
  ASSIGNMENT_DRAFT_ERROR,
  ASSIGNMENT_TARGET_DENIED_ERROR,
  assignOwner,
  mocks as assignmentActionMocks,
  unassignOwner,
};

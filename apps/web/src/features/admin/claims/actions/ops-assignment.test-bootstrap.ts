import { vi } from 'vitest';

// Shared module mocks for the assignOwner action suites. Actions load through explicit awaited
// imports below after mock registration. Suites import actions and assignment constants from
// here, so a static re-export cannot capture an uninitialized action binding.
const mocks = vi.hoisted(() => ({
  directDbAccess: [] as string[],
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@interdomestik/domain-claims/claims/transition-guard', () => ({
  isClaimStatusTransitionInGraph: () => true,
}));
vi.mock('./ops-status-action', () => ({ updateStatusAction: vi.fn() }));
vi.mock('@interdomestik/database', async () => {
  const fixture = await import('./ops-assignment.test-fixture');
  return fixture.createDatabaseModuleMock(mocks.withTenantContext, mocks.directDbAccess);
});

const { assignOwner, unassignOwner } = await import('./ops-actions');
const { ASSIGNMENT_CONFLICT_ERROR, ASSIGNMENT_TARGET_DENIED_ERROR } =
  await import('./ops-assignment');

export {
  ASSIGNMENT_CONFLICT_ERROR,
  ASSIGNMENT_TARGET_DENIED_ERROR,
  assignOwner,
  mocks as assignmentActionMocks,
  unassignOwner,
};

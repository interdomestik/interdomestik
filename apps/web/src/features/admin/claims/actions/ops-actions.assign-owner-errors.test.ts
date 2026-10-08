import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assignmentActionMocks as mocks, assignOwner } from './ops-assignment.test-bootstrap';
import { createFakeTx, routeTenantContext, sessionFor } from './ops-assignment.test-fixture';

const GENERIC_ERROR = 'Assignment failed. Please try again.';
const SENTINEL = 'sentinel-identity-9f3a';
const LEAK_FRAGMENTS = [SENTINEL, 'audit_log', 'insert into', 'params', '42501', 'row-level'];

function drizzleLikeError(): Error {
  const cause = Object.assign(
    new Error('new row violates row-level security policy for table "audit_log"'),
    { code: '42501' }
  );
  return new Error(
    `Failed query: insert into "audit_log" ("id","actor_id") values ($1,$2)\nparams: ${SENTINEL},actor-1`,
    { cause }
  );
}

function expectNoLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const fragment of LEAK_FRAGMENTS) expect(serialized).not.toContain(fragment);
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.directDbAccess.length = 0;
  mocks.getSession.mockResolvedValue(sessionFor('admin'));
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('assignOwner failure normalization', () => {
  it('returns one generic error for a Drizzle-like audit denial and leaks nothing', async () => {
    const { tx, updateSet } = createFakeTx({ auditError: drizzleLikeError() });
    const outcomes = routeTenantContext(mocks.withTenantContext, tx);

    const result = await assignOwner('claim-1', 'staff-1', 'en');

    expect(result).toEqual({ success: false, error: GENERIC_ERROR });
    expectNoLeak(result);
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(['threw']);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('Action Failed: assignOwner', 'Error');
    expectNoLeak(consoleError.mock.calls);
  });

  it('normalizes a tenant-context failure without echoing or logging its text', async () => {
    mocks.withTenantContext.mockRejectedValue(drizzleLikeError());

    const result = await assignOwner('claim-1', 'staff-1', 'en');

    expect(result).toEqual({ success: false, error: GENERIC_ERROR });
    expectNoLeak(result);
    expectNoLeak(consoleError.mock.calls);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('normalizes a thrown primitive and logs only its type', async () => {
    mocks.withTenantContext.mockRejectedValue(`select * from claims -- ${SENTINEL}`);

    const result = await assignOwner('claim-1', 'staff-1', 'en');

    expect(result).toEqual({ success: false, error: GENERIC_ERROR });
    expectNoLeak(result);
    expect(consoleError).toHaveBeenCalledWith('Action Failed: assignOwner', 'string');
    expectNoLeak(consoleError.mock.calls);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('still returns the exact expected denial strings when thrown by the context', async () => {
    for (const message of [
      'Claim not found or access denied',
      'Cannot perform assign on a terminal claim.',
    ]) {
      mocks.withTenantContext.mockRejectedValueOnce(new Error(message));
      await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toEqual({
        success: false,
        error: message,
      });
    }
    expect(consoleError).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

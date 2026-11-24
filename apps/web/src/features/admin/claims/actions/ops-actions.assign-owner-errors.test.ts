import { describe, expect, it } from 'vitest';
import { assignmentActionMocks as mocks, assignOwner } from './ops-assignment.test-bootstrap';
import {
  createFakeTx,
  expectRedactedAssignmentLog,
  routeTenantContext,
  useAdminAssignmentTest,
} from './ops-assignment.test-fixture';

const GENERIC_ERROR = 'Assignment failed. Please try again.';
const SENTINEL = 'sentinel-identity-9f3a';
const PRIVATE_DETAIL = 'Private failing row detail';
const PRIVATE_ADDRESS = 'assignment-private@example.test';
const PRIVATE_BODY = 'Private assignment message body';
const LEAK_FRAGMENTS = [
  SENTINEL,
  'audit_log',
  'insert into',
  'select * from claims',
  'params',
  'row-level',
  PRIVATE_DETAIL,
  PRIVATE_ADDRESS,
  PRIVATE_BODY,
];

function drizzleLikeError(): Error {
  const cause = Object.assign(
    new Error(`new row violates row-level security policy for table "audit_log": ${PRIVATE_BODY}`),
    { code: '42501', detail: PRIVATE_DETAIL, address: PRIVATE_ADDRESS }
  );
  return new Error(
    `Failed query: insert into "audit_log" ("id","actor_id") values ($1,$2)\nparams: ${SENTINEL},actor-1`,
    { cause }
  );
}

function expectNoLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const fragment of [...LEAK_FRAGMENTS, '42501']) expect(serialized).not.toContain(fragment);
}

const assignmentErrorLog = useAdminAssignmentTest(mocks);

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
    expectRedactedAssignmentLog(
      assignmentErrorLog().mock.calls,
      { name: 'Error', code: '42501' },
      LEAK_FRAGMENTS
    );
  });

  it('normalizes a tenant-context failure without echoing or logging its text', async () => {
    mocks.withTenantContext.mockRejectedValue(drizzleLikeError());

    const result = await assignOwner('claim-1', 'staff-1', 'en');

    expect(result).toEqual({ success: false, error: GENERIC_ERROR });
    expectNoLeak(result);
    expectRedactedAssignmentLog(
      assignmentErrorLog().mock.calls,
      { name: 'Error', code: '42501' },
      LEAK_FRAGMENTS
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('normalizes a thrown primitive and logs a redacted error', async () => {
    mocks.withTenantContext.mockRejectedValue(`select * from claims -- ${SENTINEL}`);

    const result = await assignOwner('claim-1', 'staff-1', 'en');

    expect(result).toEqual({ success: false, error: GENERIC_ERROR });
    expectNoLeak(result);
    expectRedactedAssignmentLog(
      assignmentErrorLog().mock.calls,
      { name: 'UnknownError' },
      LEAK_FRAGMENTS
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('treats plain exceptions with expected-denial text as unexpected failures', async () => {
    for (const message of [
      'Claim not found or access denied',
      'Cannot perform assign on a terminal claim.',
    ]) {
      mocks.withTenantContext.mockRejectedValueOnce(new Error(message));
      await expect(assignOwner('claim-1', 'staff-1', 'en')).resolves.toEqual({
        success: false,
        error: GENERIC_ERROR,
      });
    }
    expect(assignmentErrorLog()).toHaveBeenCalledTimes(2);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

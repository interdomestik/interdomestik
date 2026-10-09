import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OpsDomainDenialError,
  completeCommittedOpsAction,
  isCommittedRefreshPending,
  toSafeOpsActionError,
} from './ops-action-outcome';

const SENTINEL = 'select secret_customer_email from private_table; person@example.test';
afterEach(() => vi.restoreAllMocks());
describe('safe Ops outcomes', () => {
  it('excludes arbitrary error names and messages from failures and logs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error(SENTINEL);
    error.name = SENTINEL;
    const result = toSafeOpsActionError('updateStatus', error);
    expect(result).toEqual({ success: false, error: 'Action failed. Please try again.' });
    expect(JSON.stringify([result, log.mock.calls])).not.toContain(SENTINEL);
    expect(log).toHaveBeenCalledWith('Action Failed: updateStatus', 'unexpected_failure');
  });
  it('keeps a committed write successful and excludes arbitrary refresh errors', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error(SENTINEL);
    error.name = SENTINEL;
    const refresh = vi.fn(() => {
      throw error;
    });
    const result = completeCommittedOpsAction('sendMemberReminder', refresh);
    expect(result).toEqual({
      success: true,
      message: 'Saved. Reload the page if the latest state is not shown.',
      refreshPending: true,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([result, log.mock.calls])).not.toContain(SENTINEL);
    expect(log).toHaveBeenCalledWith(
      'Revalidation failed after commit: sendMemberReminder',
      'revalidation_failure'
    );
  });
  it('returns a plain success without the refresh marker when revalidation works', () => {
    const refresh = vi.fn();
    const result = completeCommittedOpsAction('updateStatus', refresh);
    expect(result).toEqual({ success: true });
    expect(result).not.toHaveProperty('refreshPending');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('recognises only the structured marker, never the message text', () => {
    expect(isCommittedRefreshPending({ success: true, refreshPending: true })).toBe(true);
    expect(
      isCommittedRefreshPending({
        success: true,
        message: 'Saved. Reload the page if the latest state is not shown.',
      })
    ).toBe(false);
    expect(isCommittedRefreshPending({ success: false, error: 'x', refreshPending: true })).toBe(
      false
    );
    expect(isCommittedRefreshPending({ success: true, refreshPending: 'true' })).toBe(false);
    expect(isCommittedRefreshPending({ success: true })).toBe(false);
    expect(isCommittedRefreshPending(null)).toBe(false);
    expect(isCommittedRefreshPending(undefined)).toBe(false);
  });
  it('does not trust arbitrary domain-denial payloads', () => {
    expect(toSafeOpsActionError('markSlaAcknowledged', new OpsDomainDenialError(SENTINEL))).toEqual(
      { success: false, error: 'Action failed. Please try again.' }
    );
  });
  it.each([
    'Claim not found or access denied',
    'Cannot perform sla_ack on a terminal claim.',
    'Illegal transition from evaluation to draft',
  ])('preserves the finite expected denial %s', message => {
    expect(toSafeOpsActionError('updateStatus', new OpsDomainDenialError(message))).toEqual({
      success: false,
      error: message,
    });
  });
  it('maps the known canonical conflict without returning its payload', () => {
    const error = new Error(SENTINEL);
    error.name = 'ClaimTransitionConflictError';
    expect(toSafeOpsActionError('updateStatus', error)).toEqual({
      success: false,
      error: 'This claim changed before the update could be saved. Reload and try again.',
    });
  });
});

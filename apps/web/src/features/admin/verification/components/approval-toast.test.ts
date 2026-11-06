import { describe, expect, it } from 'vitest';
import { verificationToastKey } from './approval-toast';

describe('verificationToastKey', () => {
  it('never reports a pending membership setup as a completed approval', () => {
    expect(verificationToastKey('approve', { success: true, fulfillment: 'pending' })).toBe(
      'toasts.approve_fulfillment_pending'
    );
    expect(verificationToastKey('approve', { success: true })).toBe('toasts.approve_success');
    expect(verificationToastKey('reject', { success: true, fulfillment: 'pending' })).toBe(
      'toasts.reject_success'
    );
  });
});

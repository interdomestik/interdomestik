import { describe, expect, it } from 'vitest';
import { resendInviteToastKey, verificationToastKey } from './approval-toast';

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

  it('flags an approval whose activation email did not go out', () => {
    expect(verificationToastKey('approve', { success: true, invite: 'pending' })).toBe(
      'toasts.approve_invite_pending'
    );
    expect(verificationToastKey('approve', { success: true, invite: 'sent' })).toBe(
      'toasts.approve_success'
    );
  });
});

describe('resendInviteToastKey', () => {
  it('maps each resend outcome to its own copy', () => {
    expect(resendInviteToastKey({ success: true })).toBe('toasts.resend_invite_success');
    expect(resendInviteToastKey({ success: false, error: 'cooldown' })).toBe(
      'toasts.resend_invite_cooldown'
    );
    expect(resendInviteToastKey({ success: false, error: 'already_active' })).toBe(
      'toasts.resend_invite_already_active'
    );
    expect(resendInviteToastKey({ success: false, error: 'delivery_failed' })).toBe(
      'toasts.resend_invite_failed'
    );
    expect(resendInviteToastKey({ success: false, error: 'not_found' })).toBe('toasts.error');
  });
});

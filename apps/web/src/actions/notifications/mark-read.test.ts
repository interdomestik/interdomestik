import { describe, expect, it, vi } from 'vitest';
import { markAsReadCore } from './mark-read.core';

// Mock the domain function
vi.mock('@interdomestik/domain-communications/notifications/mark-read', () => ({
  markAsReadCore: vi.fn(async () => ({ success: true })),
  markAllAsReadCore: vi.fn(async () => ({ success: true })),
}));

describe('actions/notifications markAsReadCore', () => {
  it('throws validation error for empty notificationId', async () => {
    await expect(
      markAsReadCore({
        session: { user: { id: 'u1' } } as any,
        notificationId: '',
      })
    ).rejects.toThrow('Notification ID is required');
  });

  it('calls domain function for valid notificationId', async () => {
    const result = await markAsReadCore({
      session: { user: { id: 'u1' } } as any,
      notificationId: 'notif-123',
    });
    expect(result).toEqual({ success: true });
  });
});

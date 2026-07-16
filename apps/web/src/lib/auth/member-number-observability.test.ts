import * as Sentry from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { captureMemberNumberLifecycleEvent } from './member-number-observability';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

describe('captureMemberNumberLifecycleEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records info-level lifecycle events with content-free operational fields', () => {
    captureMemberNumberLifecycleEvent('self_heal_invoked', {
      createdYear: 2025,
    });

    expect(Sentry.captureMessage).toHaveBeenCalledWith('member-number.self_heal_invoked', {
      level: 'info',
      tags: {
        component: 'auth.databaseHooks',
        domain: 'member-number',
        event: 'self_heal_invoked',
        outcome: 'started',
      },
      extra: {
        createdYear: 2025,
      },
    });
  });

  it('records failures without raw error content', () => {
    captureMemberNumberLifecycleEvent('self_heal_failed');

    expect(Sentry.captureMessage).toHaveBeenCalledWith('member-number.self_heal_failed', {
      level: 'error',
      tags: {
        component: 'auth.databaseHooks',
        domain: 'member-number',
        event: 'self_heal_failed',
        outcome: 'failure',
      },
      extra: {},
    });
  });

  it('drops forbidden identifiers and raw errors even when a caller supplies them', () => {
    captureMemberNumberLifecycleEvent('user_create_after_assigned', {
      createdYear: 2026,
      isNew: true,
      userId: 'user-secret',
      tenantId: 'tenant-secret',
      email: 'private@example.com',
      memberNumber: 'MEM-SECRET',
      errorMessage: 'raw provider error',
    } as never);

    const payload = JSON.stringify(vi.mocked(Sentry.captureMessage).mock.calls[0]);
    expect(payload).toContain('"createdYear":2026');
    expect(payload).toContain('"isNew":true');
    expect(payload).not.toMatch(
      /user-secret|tenant-secret|private@example|MEM-SECRET|raw provider/
    );
  });
});

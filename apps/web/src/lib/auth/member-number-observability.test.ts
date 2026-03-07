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

  it('records info-level lifecycle events with auth hook tags', () => {
    captureMemberNumberLifecycleEvent('self_heal_invoked', {
      userId: 'user-1',
      tenantId: 'tenant-1',
      createdYear: 2025,
    });

    expect(Sentry.captureMessage).toHaveBeenCalledWith('member-number.self_heal_invoked', {
      level: 'info',
      tags: {
        component: 'auth.databaseHooks',
        domain: 'member-number',
        event: 'self_heal_invoked',
      },
      extra: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        createdYear: 2025,
      },
    });
  });

  it('records error-level lifecycle events for failures', () => {
    captureMemberNumberLifecycleEvent('self_heal_failed', {
      userId: 'user-2',
      tenantId: 'tenant-2',
      createdYear: 2024,
      errorMessage: 'boom',
    });

    expect(Sentry.captureMessage).toHaveBeenCalledWith('member-number.self_heal_failed', {
      level: 'error',
      tags: {
        component: 'auth.databaseHooks',
        domain: 'member-number',
        event: 'self_heal_failed',
      },
      extra: {
        userId: 'user-2',
        tenantId: 'tenant-2',
        createdYear: 2024,
        errorMessage: 'boom',
      },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { authorizedSession, STAFF_A } from '@/test/safe-action-harness';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), write: vi.fn() }));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));
vi.mock('next/navigation', async importOriginal => importOriginal());

import { ROLE_STAFF } from './roles.core';
import { actionNormalizers, ActionDefinitionError, defineAction } from './safe-action';

const asString = (value: string) => ({ value, userId: 'other' }) as unknown as string;

describe('the WP-02 guard flip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockResolvedValue({ ok: true });
    mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
  });

  it.each([
    [
      'a scalar overwrite that returns an object',
      z.strictObject({ name: z.string().overwrite(asString) }),
    ],
    [
      'an omitted coercion on a reserved key',
      z.strictObject({ toString: z.coerce.boolean().optional() }),
    ],
    ['an anonymous trim', z.strictObject({ note: z.string().trim() })],
  ])('refuses %s at definition', (_label, input) => {
    expect(() =>
      defineAction({
        name: 'guard.flip',
        basis: { kind: 'role', roles: [ROLE_STAFF] },
        input,
        subject: { type: 'none' },
        handler: async () => 'never',
      })
    ).toThrow(ActionDefinitionError);
  });

  it('delivers a string trimmed by actionNormalizers.trim', async () => {
    const action = defineAction({
      name: 'guard.flip.trim',
      basis: { kind: 'role', roles: [ROLE_STAFF] },
      input: z.strictObject({ note: z.string().check(actionNormalizers.trim) }),
      subject: { type: 'none' },
      handler: async input => input,
    });
    expect(await action({ note: ' x ' })).toEqual({ success: true, data: { note: 'x' } });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { authorizedSession, STAFF_A } from '@/test/safe-action-harness';

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), write: vi.fn() }));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));
vi.mock('next/navigation', async importOriginal => importOriginal());

import { ROLE_STAFF } from './roles.core';
import { defineAction } from './safe-action';

const asString = (value: string) => ({ value, userId: 'other' }) as unknown as string;

// KNOWN LIMIT of WP-02 part 1 (design addendum 6, lead decision of 2026-11-20). The wrapper hands
// the handler zod's parsed value as zod returns it: a check that rewrites a scalar and a coercion are
// not judged at definition, and nothing re-reads the parsed value against the declared shape. (A check
// on an object, wrapper, array, tuple or union is refused in part 1; see safe-action.define.test.ts.)
// This is a named known-limit test under that lead decision, not a test that pins a defect: the
// runtime input guard of WP-02 part 1b refuses each schema below at definition and flips this test.
describe('KNOWN LIMIT until WP-02 part 1b: the handler receives the value as zod returns it', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockResolvedValue({ ok: true });
    mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
  });

  it.each([
    [
      'a scalar overwrite that returns an object',
      z.strictObject({ name: z.string().overwrite(asString) }),
      { name: 'n' },
      { name: { value: 'n', userId: 'other' } },
    ],
    [
      'a coercion of an omitted key named like an Object.prototype member',
      z.strictObject({ toString: z.coerce.boolean().optional() }),
      {},
      { toString: true },
    ],
    ['a normaliser', z.strictObject({ note: z.string().trim() }), { note: ' x ' }, { note: 'x' }],
  ])('flip in part 1b: %s reaches the handler', async (_label, input, raw, expected) => {
    const seen: unknown[] = [];
    const action = defineAction({
      name: 'limit.op',
      basis: { kind: 'role', roles: [ROLE_STAFF] },
      input: input as z.ZodType,
      subject: { type: 'none' },
      handler: value => {
        seen.push(value);
        return Promise.resolve('ok');
      },
    });
    expect(await action(raw)).toEqual({ success: true, data: 'ok' });
    expect(seen).toEqual([expected]);
  });
});

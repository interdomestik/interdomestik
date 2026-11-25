import { MissingTenantError, UnauthorizedError } from '@interdomestik/shared-auth/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  authorizedSession,
  MANAGER_NO_BRANCH,
  MEMBER_A,
  STAFF_A,
} from '@/test/safe-action-harness';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  write: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.write }));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.capture,
  setUser: vi.fn(),
  setTag: vi.fn(),
}));
vi.mock('next/navigation', async importOriginal => importOriginal());

import { notFound, redirect } from 'next/navigation';
import { ROLE_STAFF } from './roles.core';
import { actionFailure, defineAction } from './safe-action';
import { issuesOf } from './safe-action.output';

const STAFF_ONLY = [ROLE_STAFF] as const;
const claimInput = z.strictObject({ claimId: z.string().min(1), note: z.string().max(10) });

function staffAction(handler: (input: z.output<typeof claimInput>) => Promise<unknown>) {
  return defineAction({
    name: 'claims.note',
    basis: { kind: 'role', roles: STAFF_ONLY },
    input: claimInput,
    subject: { type: 'claim', from: 'claimId' },
    handler,
  });
}

const refusalRows = () => mocks.write.mock.calls.map(call => call[0]);

describe('defineAction at run time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockResolvedValue({ ok: true });
    mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
  });

  it('rejects an omitted required coercion before its predicate or audit writer runs', async () => {
    const refine = vi.fn(() => {
      throw Object.assign(new Error('denied'), { code: 'FORBIDDEN' });
    });
    const handler = vi.fn(async () => 'never');
    const action = defineAction({
      name: 'claims.required-coercion',
      basis: { kind: 'role', roles: STAFF_ONLY },
      subject: { type: 'none' },
      input: z.strictObject({ enabled: z.coerce.boolean().readonly().nullable().refine(refine) }),
      handler,
    });
    expect(await action({})).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(refine).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the handler with the parsed input and wraps its value', async () => {
    const handler = vi.fn((input: { claimId: string }) => Promise.resolve(`seen ${input.claimId}`));
    const result = await staffAction(handler)({ claimId: 'c-1', note: 'ok' });
    expect(result).toEqual({ success: true, data: 'seen c-1' });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('omits data when the handler returns nothing', async () => {
    expect(await staffAction(async () => undefined)({ claimId: 'c-1', note: '' })).toEqual({
      success: true,
    });
  });

  it('treats a returned { success: false } object as data, not as a failure', async () => {
    const result = await staffAction(async () => ({ success: false, code: 'FORBIDDEN' }))({
      claimId: 'c-1',
      note: '',
    });
    expect(result).toEqual({ success: true, data: { success: false, code: 'FORBIDDEN' } });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([
    ['allows the declared role', STAFF_A, true],
    ['denies another role', MEMBER_A, false],
    ['denies a session without a role', { ...STAFF_A, role: null }, false],
  ])('role basis %s', async (_label, user, allowed) => {
    mocks.authorize.mockResolvedValue(authorizedSession(user));
    const handler = vi.fn(() => Promise.resolve('done'));
    const result = await staffAction(handler)({ claimId: 'c-9', note: '' });
    expect(result.success).toBe(allowed);
    expect(handler).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (!allowed) {
      expect(result).toEqual({ success: false, code: 'FORBIDDEN', error: 'Forbidden' });
      expect(refusalRows()).toEqual([
        expect.objectContaining({
          action: 'action.refused',
          entityType: 'server_action',
          entityId: 'claims.note',
          actorId: user.id,
          metadata: { code: 'FORBIDDEN', basis: 'role', subject: { type: 'claim', id: 'c-9' } },
        }),
      ]);
      expect(mocks.write.mock.calls[0]?.[0]).not.toHaveProperty('headers');
    }
  });

  it('refuses an anonymous caller without any database write', async () => {
    mocks.authorize.mockResolvedValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await staffAction(async () => 'x')({ claimId: 'c-1', note: '' });
    expect(result).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Unauthorized' });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[SafeAction] refused', {
      operation: 'claims.note',
      code: 'UNAUTHORIZED',
      basis: 'role',
      subjectType: 'claim',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('c-1');
  });

  it('answers a session without tenant with the fixed MISSING_TENANT message', async () => {
    mocks.authorize.mockRejectedValue(new MissingTenantError('leaky detail'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await staffAction(async () => 'x')({ claimId: 'c-1', note: '' });
    expect(result).toEqual({
      success: false,
      code: 'MISSING_TENANT',
      error: 'Missing tenant context',
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('refuses a branch manager without a branch before the basis and records it', async () => {
    mocks.authorize.mockResolvedValue(authorizedSession(MANAGER_NO_BRANCH));
    const result = await staffAction(async () => 'x')({ claimId: 'c-1', note: '' });
    expect(result).toMatchObject({ success: false, code: 'FORBIDDEN_NO_BRANCH' });
    expect(refusalRows()).toHaveLength(1);
  });

  it('refuses invalid input with issue codes only, before the handler', async () => {
    const handler = vi.fn(() => Promise.resolve('x'));
    const result = await staffAction(handler)({ claimId: '', note: 'far too long', extra: 1 });
    expect(result).toEqual({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Invalid input',
      issues: { claimId: 'too_small', note: 'too_big', _root: 'unrecognized_keys' },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('names an invalid field even when its name is an Object.prototype member (r2 B13)', () => {
    // The issue map holds own keys only, whatever the field is named.
    const schema = z.strictObject({ constructor: z.string(), toString: z.string().min(2) });
    const parsed = schema.safeParse({ constructor: 1, toString: 'a' });
    expect(parsed.success).toBe(false);
    expect(issuesOf(parsed.error as z.ZodError)).toEqual({
      constructor: 'invalid_type',
      toString: 'too_small',
    });
  });

  it('returns input data the client transport can serialise: plain at every depth (r6 B24)', async () => {
    const action = defineAction({
      name: 'profile.echo',
      basis: { kind: 'role', roles: STAFF_ONLY },
      input: z.strictObject({
        name: z.string(),
        profile: z.strictObject({ nick: z.string().optional() }),
        tags: z.array(z.strictObject({ n: z.number() })),
      }),
      subject: { type: 'none' },
      handler: input => Promise.resolve(input),
    });
    const input = Object.assign(Object.create(null), {
      name: 'n',
      profile: Object.create(null),
      tags: [Object.assign(Object.create(null), { n: 1 })],
    });
    const result = await action(input);
    expect(result).toMatchObject({ success: true });
    const plain = (value: unknown): boolean =>
      Array.isArray(value)
        ? Object.getPrototypeOf(value) === Array.prototype && value.every(plain)
        : value === null ||
          typeof value !== 'object' ||
          (Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(plain));
    expect(plain((result as { data: unknown }).data)).toBe(true);
    const clientUrl = import.meta
      .resolve('next/dist/compiled/react-server-dom-webpack/client.node.js');
    const { encodeReply }: { encodeReply(value: unknown): Promise<string | FormData> } =
      await import(clientUrl);
    expect(await encodeReply(result)).toBe(JSON.stringify(result));
  });

  it('reads a snapshot of its definition: changing the definition later changes nothing (r6 B23, r7 H05)', async () => {
    const seen: string[] = [];
    const definition = {
      name: 'note.snapshot',
      basis: { kind: 'role', roles: [...STAFF_ONLY] as string[] },
      input: z.strictObject({ note: z.string() }) as z.ZodType,
      subject: { type: 'none' },
      handler: (input: { note: string }) => {
        seen.push(input.note);
        return Promise.resolve('ok');
      },
    };
    const action = defineAction(definition as never);
    definition.input = z.strictObject({ note: z.string().trim() });
    definition.basis.roles.push('member');
    definition.handler = () => Promise.resolve('replaced');
    expect(await action({ note: ' x ' })).toEqual({ success: true, data: 'ok' });
    expect(seen).toEqual([' x ']);
    mocks.authorize.mockResolvedValue(authorizedSession(MEMBER_A));
    expect(await action({ note: 'y' })).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Forbidden',
    });
    expect(seen).toEqual([' x ']);
  });

  it('keeps its own copy of the roles when the basis is a class instance (r7 B23)', async () => {
    const basis = new (class {
      kind = 'role';
      roles: string[] = [ROLE_STAFF];
    })();
    const action = defineAction({
      name: 'note.roles',
      basis,
      input: z.strictObject({ note: z.string() }),
      subject: { type: 'none' },
      handler: () => Promise.resolve('ok'),
    } as never);
    basis.roles.push('member');
    mocks.authorize.mockResolvedValue(authorizedSession(MEMBER_A));
    expect(await action({ note: 'x' })).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Forbidden',
    });
  });

  it('records a returned refusal once and returns it', async () => {
    const result = await staffAction(async () => actionFailure('FORBIDDEN', 'Not your claim'))({
      claimId: 'c-2',
      note: '',
    });
    expect(result).toEqual({ success: false, code: 'FORBIDDEN', error: 'Not your claim' });
    expect(refusalRows()).toHaveLength(1);
  });

  it('records a concealed cross-tenant denial as FORBIDDEN and answers NOT_FOUND', async () => {
    const concealed = actionFailure('FORBIDDEN', 'secret', {
      conceal: 'NOT_FOUND',
      reason: 'cross_tenant',
    });
    const result = await staffAction(async () => concealed)({ claimId: 'c-3', note: '' });
    expect(result).toEqual({ success: false, code: 'NOT_FOUND', error: 'Not found' });
    expect(refusalRows()[0]?.metadata).toEqual({
      code: 'FORBIDDEN',
      basis: 'role',
      subject: { type: 'claim', id: 'c-3' },
      reason: 'cross_tenant',
    });
  });

  it('records a thrown typed refusal once', async () => {
    const result = await staffAction(async () => {
      throw new UnauthorizedError('Unauthorized');
    })({ claimId: 'c-4', note: '' });
    expect(result).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Unauthorized' });
    expect(refusalRows()).toHaveLength(1);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('rethrows Next control flow from the handler', async () => {
    await expect(staffAction(async () => notFound())({ claimId: 'c', note: '' })).rejects.toThrow();
    await expect(
      staffAction(async () => redirect('/en/login'))({ claimId: 'c', note: '' })
    ).rejects.toThrow();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

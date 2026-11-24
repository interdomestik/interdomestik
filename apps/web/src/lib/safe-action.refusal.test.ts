import type { auditLog } from '@interdomestik/database';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Query } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { authorizedSession, MEMBER_A } from '@/test/safe-action-harness';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  capture: vi.fn(),
  values: vi.fn(),
  withTenantAuthority: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.capture,
  setUser: vi.fn(),
  setTag: vi.fn(),
}));
// The real writeAuditEvent runs; only the transaction underneath it fails.
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.withTenantAuthority,
}));

import { ROLE_STAFF } from './roles.core';
import { actionFailure, defineAction, defineFormAction } from './safe-action';
import { extractSubject } from './safe-action.refusal';

const STAFF_ONLY = [ROLE_STAFF] as const;

describe('extractSubject reads the raw input, never the parsed one', () => {
  const claim = { type: 'claim', from: 'claimId' } as const;
  const object = (raw: unknown) => extractSubject(claim, raw, { form: false, actorId: 'u-1' });
  const form = (raw: unknown) => extractSubject(claim, raw, { form: true, actorId: 'u-1' });

  it.each([
    ['present', { claimId: 'claim_1-A' }, 'claim_1-A'],
    ['missing', {}, 'unknown'],
    ['of the wrong type', { claimId: 42 }, 'unknown'],
    ['too long', { claimId: 'x'.repeat(129) }, 'unknown'],
    ['carrying a separator', { claimId: 'a\nb' }, 'unknown'],
    ['inherited, not own', Object.create({ claimId: 'proto' }), 'unknown'],
    ['not an object', 'claim_1', 'unknown'],
  ])('an object input %s', (_label, raw, id) => {
    expect(object(raw)).toEqual({ type: 'claim', id });
  });

  it('a form input gives exactly one string entry, else unknown', () => {
    const one = new FormData();
    one.append('claimId', 'c-1');
    const two = new FormData();
    two.append('claimId', 'c-1');
    two.append('claimId', 'c-2');
    const file = new FormData();
    file.append('claimId', new File(['x'], 'x.txt'));
    expect(form(one)).toEqual({ type: 'claim', id: 'c-1' });
    expect(form(two)).toEqual({ type: 'claim', id: 'unknown' });
    expect(form(file)).toEqual({ type: 'claim', id: 'unknown' });
    expect(form({ claimId: 'c-1' })).toEqual({ type: 'claim', id: 'unknown' });
  });

  it('never runs an accessor or a proxy trap when extracting a refusal subject', () => {
    const getter = vi.fn(() => 'claim_1');
    const accessor = Object.defineProperty({}, 'claimId', { get: getter, enumerable: true });
    const trap = vi.fn(() => {
      throw new Error('trap');
    });
    const throwing = new Proxy({}, { getOwnPropertyDescriptor: trap });
    const proxyForm = new Proxy(new FormData(), { getPrototypeOf: trap, get: trap });
    const inheritedProxy = Object.create(new Proxy({}, { getPrototypeOf: trap }));
    expect(object(accessor)).toEqual({ type: 'claim', id: 'unknown' });
    expect(getter).not.toHaveBeenCalled();
    expect(object(throwing)).toEqual({ type: 'claim', id: 'unknown' });
    expect(form(proxyForm)).toEqual({ type: 'claim', id: 'unknown' });
    expect(form(inheritedProxy)).toEqual({ type: 'claim', id: 'unknown' });
    expect(trap).not.toHaveBeenCalled();
  });

  it('extracts the submitted form subject without invoking an own getAll', () => {
    const raw = new FormData();
    raw.append('claimId', 'submitted');
    const getAll = vi.fn(() => ['override']);
    Object.defineProperty(raw, 'getAll', { value: getAll });
    expect(form(raw)).toEqual({ type: 'claim', id: 'submitted' });
    expect(getAll).not.toHaveBeenCalled();
  });

  it('self names the actor and none names nothing', () => {
    expect(extractSubject({ type: 'self' }, {}, { form: false, actorId: 'u-1' })).toEqual({
      type: 'self',
      id: 'u-1',
    });
    expect(extractSubject({ type: 'none' }, {}, { form: false, actorId: 'u-1' })).toEqual({
      type: 'none',
    });
  });
});

describe('the refusal record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(MEMBER_A));
    const failure = Object.assign(new Error('insert failed: secret parameter 42'), {
      name: 'PostgresError',
    });
    mocks.values.mockRejectedValue(failure);
    mocks.withTenantAuthority.mockImplementation(
      (_authority: unknown, run: (tx: unknown) => unknown) =>
        Promise.resolve(run({ insert: () => ({ values: mocks.values }) }))
    );
  });

  it.each([false, true])(
    'encodes refusal metadata with the real Drizzle insert builder (inherited toJSON: %s)',
    async inheritedToJSON => {
      const db = drizzle.mock();
      const toJSON = vi.fn(() => ({ altered: true }));
      let query: Query | undefined;
      const tx = {
        insert: (table: typeof auditLog) => ({
          values: (row: typeof auditLog.$inferInsert) => {
            query = db.insert(table).values(row).toSQL();
          },
        }),
      };
      mocks.withTenantAuthority.mockImplementationOnce(async (_authority, run) => {
        await Promise.resolve();
        if (inheritedToJSON) {
          Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, value: toJSON });
        }
        try {
          return run(tx);
        } finally {
          if (inheritedToJSON) Reflect.deleteProperty(Object.prototype, 'toJSON');
        }
      });
      const action = defineAction({
        name: 'claims.withdraw',
        basis: { kind: 'self' },
        input: z.strictObject({ claimId: z.string() }),
        subject: { type: 'claim', from: 'claimId' },
        handler: () =>
          Promise.resolve(actionFailure('FORBIDDEN', undefined, { reason: 'cross_tenant' })),
      });

      const result = await action({ claimId: 'c-7' });

      if (mocks.capture.mock.calls.length) throw mocks.capture.mock.calls[0][0];
      expect(result).toMatchObject({ success: false, code: 'FORBIDDEN' });
      expect(query?.params).toContain(
        JSON.stringify({
          code: 'FORBIDDEN',
          basis: 'self',
          subject: { type: 'claim', id: 'c-7' },
          reason: 'cross_tenant',
        })
      );
      expect(toJSON).not.toHaveBeenCalled();
    }
  );

  it('keeps the refusal, captures the error and logs only operation, code and error name', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const action = defineAction({
      name: 'claims.withdraw',
      basis: { kind: 'role', roles: STAFF_ONLY },
      input: z.strictObject({ claimId: z.string() }),
      subject: { type: 'claim', from: 'claimId' },
      handler: () => Promise.resolve('never'),
    });

    const result = await action({ claimId: 'c-7' });

    expect(result).toEqual({ success: false, code: 'FORBIDDEN', error: 'Forbidden' });
    expect(mocks.values).toHaveBeenCalledTimes(1);
    expect(mocks.values.mock.calls[0]?.[0]).toMatchObject({
      tenantId: 'tenant-a',
      action: 'action.refused',
      entityId: 'claims.withdraw',
    });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith('[SafeAction] refusal record failed', {
      operation: 'claims.withdraw',
      code: 'FORBIDDEN',
      errorName: 'PostgresError',
    });
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).not.toContain('secret parameter');
    expect(logged).not.toContain('c-7');
  });

  it('records a denied form submission with the subject read from the form', async () => {
    mocks.values.mockResolvedValue(undefined);
    const action = defineFormAction({
      name: 'claims.withdraw.form',
      basis: { kind: 'role', roles: STAFF_ONLY },
      input: z.strictObject({ claimId: z.string() }),
      subject: { type: 'claim', from: 'claimId' },
      handler: () => Promise.resolve('never'),
    });
    const formData = new FormData();
    formData.append('claimId', 'c-8');

    await action(undefined, formData);

    expect(mocks.values).toHaveBeenCalledTimes(1);
    expect(mocks.values.mock.calls[0]?.[0].metadata).toEqual({
      code: 'FORBIDDEN',
      basis: 'role',
      subject: { type: 'claim', id: 'c-8' },
    });
  });
});

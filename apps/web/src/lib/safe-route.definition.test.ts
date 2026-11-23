// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { mocks } from './__fixtures__/safe-route/test-support';
import { ROLE_STAFF } from './roles.core';
import { ownerColumnKeys, TENANT_IDENTITY_KEYS } from './safe-action.owner-keys';
import { ActionDefinitionError } from './safe-action.schema';
import { defineRoute } from './safe-route';

const PARTS = ['params', 'query', 'body'] as const;
const ROLE = { kind: 'role', roles: [ROLE_STAFF] } as const;
const SELF = { kind: 'self' } as const;
const base = {
  name: 'fixtures.definition',
  method: 'POST',
  basis: SELF,
  subject: { type: 'none' },
  handler: mocks.body,
} as const;

// Deliberately exercise runtime checks for values supplied without TypeScript.
function expectRefused(fields: Record<string, unknown>, detail?: RegExp) {
  const define = () => defineRoute({ ...base, ...fields });
  expect(define).toThrow(ActionDefinitionError);
  if (detail) expect(define).toThrow(detail);
  expect(mocks.body).toHaveBeenCalledTimes(0);
}

it.each(['development', 'production', 'test'])(
  'refuses public and signature under NODE_ENV=%s',
  environment => {
    vi.stubEnv('NODE_ENV', environment);
    expectRefused({ basis: { kind: 'public', entry: 'intake' } }, /basis must be role or self/u);
    expectRefused(
      { basis: { kind: 'signature', entry: 'machine' } },
      /basis must be role or self/u
    );
  }
);

it.each(['GET', 'HEAD', 'OPTIONS', 'post', 1, undefined, { method: 'POST' }])(
  'rejects a definition whose method is %j',
  method => expectRefused({ method }, /method must be POST/u)
);

it.each(PARTS)('refuses tenant identity schema keys in %s for role and self', part => {
  for (const basis of [ROLE, SELF]) {
    for (const key of ['tenantId', 'accessTenantId']) {
      expectRefused({ basis, [part]: z.strictObject({ [key]: z.string() }) }, new RegExp(key, 'u'));
    }
  }
});

it.each(PARTS)('refuses every self owner key in the %s schema', part => {
  const ownerKeys = [...ownerColumnKeys()].filter(key => !TENANT_IDENTITY_KEYS.has(key));
  expect(ownerKeys).toContain('userId');
  for (const key of ownerKeys) {
    expectRefused(
      { basis: SELF, [part]: z.strictObject({ [key]: z.string() }) },
      new RegExp(key, 'u')
    );
  }
});

it.each(PARTS)('refuses present non-schema and non-strict %s values', part => {
  for (const schema of [null, undefined, {}, 'schema', z.string(), z.object({})]) {
    expectRefused({ [part]: schema });
  }
});

it('reads schemas as own data fields, ignoring inheritance and refusing accessors', () => {
  const get = vi.fn(() => z.strictObject({ note: z.string() }));
  const inherited = Object.assign(Object.create({ body: z.string() }), base);
  expect(defineRoute(inherited)).toEqual(expect.any(Function));
  const accessor = Object.defineProperty({ ...base }, 'body', { get, enumerable: true });
  expect(() => defineRoute(accessor)).toThrow(ActionDefinitionError);
  expect(get).toHaveBeenCalledTimes(0);
  expect(mocks.body).toHaveBeenCalledTimes(0);
});

it('refuses a body subject and a missing declared source key', () => {
  expectRefused({ subject: { type: 'claim', from: 'body.caseId' } }, /params or query/u);
  expectRefused({ subject: { type: 'claim', from: 'query.caseId' } }, /not a declared input path/u);
});

it('refuses a mixed array/scalar query field through the captured shape rule', () => {
  expectRefused(
    {
      query: z.strictObject({ term: z.union([z.string(), z.array(z.string())]) }),
    },
    /array/u
  );
});

it('preserves the guard refusal for overlapping array branches in a query union', () => {
  expectRefused(
    {
      query: z.strictObject({ tags: z.union([z.array(z.string()), z.array(z.number())]) }),
    },
    /query.tags: a plain union must have distinct branch kinds/u
  );
});

it('refuses async refinements at definition through the shared guard', () => {
  expectRefused(
    {
      body: z.strictObject({ note: z.string().refine(async () => true) }),
    },
    /async refinements are not supported/u
  );
});

it.each([0, -1, 1.5, 1_048_577, Number.NaN, Infinity])(
  'refuses body limit %s outside the permitted integer range',
  maxBodyBytes => expectRefused({ maxBodyBytes }, /maxBodyBytes/u)
);

it.each([0, 1.5, Infinity])('refuses an invalid limiter setting of %s on either field', value => {
  expectRefused({ rateLimit: { limit: value, windowSeconds: 30 } }, /positive integer/u);
  expectRefused({ rateLimit: { limit: 4, windowSeconds: value } }, /positive integer/u);
});

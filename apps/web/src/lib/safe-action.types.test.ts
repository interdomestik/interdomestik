import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { ROLE_STAFF } from './roles.core';
import {
  actionFailure,
  defineAction,
  type ActionResult,
  type CtxFor,
  type ProtectedActionContext,
  type PublicActionContext,
} from './safe-action';

// Compile-only: `pnpm type-check` covers this file; the runtime body is trivial.
const STAFF_ONLY = [ROLE_STAFF] as const;
const input = z.strictObject({ claimId: z.string(), count: z.number().optional() });

type Handler<T> = (value: z.output<typeof input>, ctx: ProtectedActionContext) => Promise<T>;
type Defined<T> = (raw: unknown) => ActionResult<T>;

describe('safe-action types', () => {
  it('a public handler gets no session and no authority', () => {
    expectTypeOf<CtxFor<{ kind: 'public'; entry: string }>>().toEqualTypeOf<PublicActionContext>();
    expectTypeOf<PublicActionContext>().not.toHaveProperty('session');
    expectTypeOf<PublicActionContext>().not.toHaveProperty('authority');
  });

  it('a protected handler gets the canonical context', () => {
    expectTypeOf<
      CtxFor<{ kind: 'role'; roles: typeof STAFF_ONLY }>
    >().toEqualTypeOf<ProtectedActionContext>();
    expectTypeOf<CtxFor<{ kind: 'self' }>>().toEqualTypeOf<ProtectedActionContext>();
  });

  it('the handler receives the parsed output and the action returns exactly ActionResult<T>', () => {
    expectTypeOf<Parameters<Handler<string>>[0]>().toEqualTypeOf<{
      claimId: string;
      count?: number | undefined;
    }>();
    type Built = typeof import('./safe-action').defineAction<
      { kind: 'role'; roles: typeof STAFF_ONLY },
      typeof input,
      string
    >;
    expectTypeOf<ReturnType<Built>>().toEqualTypeOf<Defined<string>>();
  });

  it('a handler mixing a value and a failure infers the value type only', () => {
    const action = defineAction({
      name: 'types.mixed',
      basis: { kind: 'role', roles: STAFF_ONLY },
      input,
      subject: { type: 'claim', from: 'claimId' },
      handler: (value, ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<ProtectedActionContext>();
        return Promise.resolve(
          value.claimId === 'x' ? actionFailure('FORBIDDEN') : (value.count ?? 0)
        );
      },
    });
    expectTypeOf(action).toEqualTypeOf<Defined<number>>();
  });

  it('actionFailure is not assignable to a success value', () => {
    expectTypeOf(actionFailure('FORBIDDEN')).not.toEqualTypeOf<string>();
  });
});

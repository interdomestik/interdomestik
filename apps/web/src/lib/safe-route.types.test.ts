// @vitest-environment node
import type { Params as SegmentParams } from 'next/dist/server/request/params';
import type { NextRequest } from 'next/server';
import { expectTypeOf, it } from 'vitest';

import type * as fixture from './__fixtures__/safe-route/role';
import type { RouteContext } from './safe-route';

// Next 16.4.1 next-types-plugin/index.js:85-95, 145-160. The plugin's SegmentParams
// default is permissive. Using Next's concrete string/string[] params shape also
// checks the value type while preserving the generated required Promise constraint.
type RouteContextForNext = { params: Promise<SegmentParams> };
type ParamCheck<T> = { __tag__: string; __param_position__: string; __param_type__: T };
type Callable = (...args: never[]) => unknown;
type MaybeField<T, K extends string> =
  T extends Record<K, infer Field> ? (Field extends Callable ? Field : never) : never;
type SecondArg<T extends Callable> = T extends (...args: [never, infer Context]) => unknown
  ? Context
  : never;
type Diff<Base, Actual extends Base> = Omit<Actual, keyof Base>;

function checkFields<Fields extends Record<PropertyKey, never>>(..._fields: Fields[]) {}

function invalidCalls(post: typeof fixture.POST, request: NextRequest) {
  // @ts-expect-error null is not route params
  void post(request, { params: null });
  // @ts-expect-error a scalar is not route params
  void post(request, { params: 'case-a' });
}

it('satisfies Next’s generated second argument check for the fixture export', () => {
  checkFields<
    Diff<
      ParamCheck<RouteContextForNext>,
      {
        __tag__: 'POST';
        __param_position__: 'second';
        __param_type__: SecondArg<MaybeField<typeof fixture, 'POST'>>;
      }
    >
  >();
  expectTypeOf(invalidCalls).toBeFunction();
});

// Prove this check fails if only the broad callable signature is visible.
type WithoutNextOverload = (request: Request, ctx: RouteContext) => Promise<Response>;

it('requires the final promise overload', () => {
  checkFields<
    Diff<
      ParamCheck<RouteContextForNext>,
      // @ts-expect-error the broad signature alone cannot pass Next’s check
      {
        __tag__: 'POST';
        __param_position__: 'second';
        __param_type__: SecondArg<WithoutNextOverload>;
      }
    >
  >();
});

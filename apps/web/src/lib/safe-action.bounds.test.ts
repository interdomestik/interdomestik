import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ROLE_ADMIN } from './roles.core';
import { ActionDefinitionError, defineAction } from './safe-action';

const ADMIN_ONLY = [ROLE_ADMIN] as const;
const handler = () => Promise.resolve('ok');

function define(input: z.ZodType) {
  const definition = {
    name: 'bounds.op',
    basis: { kind: 'role', roles: ADMIN_ONLY },
    input,
    subject: { type: 'none' },
    handler,
  } as const;
  return () => defineAction(definition);
}

// Astra r12 B39-B41: the walk is bounded in depth and in nodes visited, so a schema that is too
// deep, too large through reuse, or rebuilt on each read is refused with a definition error.
describe('definition: a bounded walk (r12 B39, B40, B41)', () => {
  const tooLarge = /a schema deeper than 32 levels or past 5000 units of walk work/;

  it('refuses a schema reused at sibling keys on every level (B39), without walking it all', () => {
    let node: z.ZodType = z.strictObject({ v: z.string() });
    for (let level = 0; level < 14; level += 1) node = z.strictObject({ a: node, b: node });
    const started = Date.now();
    expect(define(z.strictObject({ x: node }))).toThrow(tooLarge);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('refuses a deep finite schema with a definition error, not a stack overflow (B40)', () => {
    let deep: z.ZodType = z.string();
    for (let level = 0; level < 2400; level += 1) deep = z.array(deep);
    expect(define(z.strictObject({ deep }))).toThrow(ActionDefinitionError);
    expect(define(z.strictObject({ deep }))).toThrow(tooLarge);
  });

  it('refuses a tree rebuilt by a factory on each read (B41)', () => {
    const node = (): z.ZodType =>
      z.strictObject({
        name: z.string(),
        get children() {
          return z.array(node());
        },
      });
    expect(define(z.strictObject({ tree: node() }))).toThrow(ActionDefinitionError);
    expect(define(z.strictObject({ tree: node() }))).toThrow(tooLarge);
  });

  it('accepts a schema 20 levels deep', () => {
    let nested: z.ZodType = z.strictObject({ v: z.string() });
    for (let level = 0; level < 19; level += 1) nested = z.strictObject({ n: nested });
    expect(define(z.strictObject({ nested }))).not.toThrow();
  });
});

// Astra r13 B42-B45: the bounds cover the walk's own work. Shape fields are read one at a time
// under the budget and a stack exhausted while reading them is a definition error (B42); every
// check scanned and every catchall inspected counts against the node budget (B43, B44); and the
// scalar-wrapper test follows at most the depth bound (B45).
describe('definition: the bounds cover all of the walk (r13 B42-B45)', () => {
  const tooLarge = /a schema deeper than 32 levels or past 5000 units of walk work/;

  it('refuses a shape whose field getters exhaust the stack, as a definition error (B42)', () => {
    let previous = z.strictObject({ value: z.string() });
    for (let level = 0; level < 20000; level += 1) {
      const inner = previous;
      previous = z.strictObject({
        get value() {
          return inner.shape.value;
        },
      });
    }
    expect(define(z.strictObject({ chain: previous }))).toThrow(ActionDefinitionError);
  });

  it('counts the checks it scans: one field schema with many checks, shared by siblings (B43)', () => {
    let shared = z.string();
    for (let check = 0; check < 100; check += 1) shared = shared.min(1);
    const fields = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`f${i}`, shared]));
    expect(define(z.strictObject(fields))).toThrow(tooLarge);
  });

  it('counts the catchalls it inspects (B44)', () => {
    const empty = z.strictObject({});
    const fields = Object.fromEntries(Array.from({ length: 2600 }, (_, i) => [`f${i}`, empty]));
    expect(define(z.strictObject(fields))).toThrow(tooLarge);
  });

  it('follows a wrapper chain no further than the depth bound (B45)', () => {
    let wrapped: z.ZodType = z.string();
    const chain: z.ZodType[] = [];
    for (let level = 0; level < 200; level += 1) {
      wrapped = wrapped.optional();
      chain.push(wrapped);
    }
    // Instrument the 100th wrapper from the inside: its inner type is never read when the walk
    // refuses at depth 33 and the scalar-wrapper test stops at the depth bound.
    const deepDef = chain[99]._zod.def as unknown as Record<string, unknown>;
    const inner = deepDef.innerType;
    let reads = 0;
    Object.defineProperty(deepDef, 'innerType', {
      get: () => {
        reads += 1;
        return inner;
      },
    });
    expect(define(z.strictObject({ wrapped }))).toThrow(tooLarge);
    expect(reads).toBe(0);
  });
});

// Lead decision on Astra r14 (design addendum 13): any exception other than ActionDefinitionError
// thrown while the schema is judged is a definition error, whatever its type or realm (B42); and a
// catchall is charged before its type is read, so past the budget the budget is the reason (B44).
describe('definition: every failure is a definition error, charged first (r14 B42, B44)', () => {
  const throwingField = (thrown: unknown) =>
    z.strictObject({
      get broken() {
        throw thrown;
        return z.string();
      },
    });

  it.each([
    ['a TypeError', new TypeError('not initialised')],
    ['a thrown string', 'plain'],
    ['a thrown object', { reason: 'odd' }],
  ])('turns %s from a field getter into a definition error', (_label, thrown) => {
    expect(define(z.strictObject({ bad: throwingField(thrown) }))).toThrow(ActionDefinitionError);
    expect(define(z.strictObject({ bad: throwingField(thrown) }))).toThrow(
      /a schema that cannot be judged/
    );
  });

  // The thrown value is never read: not even `instanceof` runs on it, so no trap fires (r15 B42).
  it('never reads the thrown value, even through a proxy trap (r15 B42)', () => {
    const trapped: string[] = [];
    const thrown = new Proxy(
      {},
      new Proxy(
        {},
        {
          get: (_handler, trap) => () => {
            trapped.push(String(trap));
            throw new Error('the thrown value was read');
          },
        }
      )
    );
    expect(define(z.strictObject({ bad: throwingField(thrown) }))).toThrow(
      /a schema that cannot be judged/
    );
    expect(trapped).toEqual([]);
  });

  it('charges a catchall before reading its type (B44)', () => {
    const fields: Record<string, z.ZodType> = Object.fromEntries(
      Array.from({ length: 4997 }, (_, i) => [`f${String(i).padStart(4, '0')}`, z.string()])
    );
    fields.zLast = z.strictObject({}).catchall(z.string());
    expect(define(z.strictObject(fields))).toThrow(
      /a schema deeper than 32 levels or past 5000 units of walk work/
    );
  });
});

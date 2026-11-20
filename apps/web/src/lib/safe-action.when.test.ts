import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ROLE_ADMIN } from './roles.core';
import { ActionDefinitionError, defineAction, defineFormAction } from './safe-action';

const ADMIN_ONLY = [ROLE_ADMIN] as const;
const handler = () => Promise.resolve('ok');
const row = z.strictObject({ name: z.string() });
// A developer `when` callback: it receives zod's writable parse payload (Astra r8 B28). zod's types
// declare `when` on refinements only; its size and length checks accept it at run time.
const withWhen = { when: () => true } as never;

function define(input: z.ZodType, form = false) {
  const definition = {
    name: 'when.op',
    basis: { kind: 'role', roles: ADMIN_ONLY },
    input,
    subject: { type: 'none' },
    handler,
  } as const;
  return () => (form ? defineFormAction(definition) : defineAction(definition));
}

// Lead decision after Astra r8 (design addendum 7): a check passes only with zod's own default
// `when`, on any node, at any depth; a custom `when` could change any value the payload reaches.
describe('definition: no check with a custom when callback (addendum 7, r8 B28)', () => {
  it.each([
    ['an array min', z.strictObject({ rows: z.array(row).min(1, withWhen) })],
    ['an array max', z.strictObject({ rows: z.array(row).max(5, withWhen) })],
    ['an array length', z.strictObject({ rows: z.array(row).length(1, withWhen) })],
    [
      'an array min inside a discriminated-union branch',
      z.strictObject({
        v: z.discriminatedUnion('k', [
          z.strictObject({ k: z.literal('a'), rows: z.array(row).min(1, withWhen) }),
        ]),
      }),
    ],
    [
      'an array min inside an optional wrapper',
      z.strictObject({ rows: z.array(row).min(1, withWhen).optional() }),
    ],
    [
      'a refine on a scalar wrapper',
      z.strictObject({
        note: z
          .string()
          .optional()
          .refine(() => true, withWhen),
      }),
    ],
    ['a scalar min', z.strictObject({ note: z.string().min(1, withWhen) })],
    ['a scalar refine', z.strictObject({ note: z.string().refine(() => true, withWhen) })],
    [
      "a check on a strict object's catchall",
      z.strictObject({ a: z.string() }).catchall(z.never().refine(() => true, withWhen)),
    ],
    ['a format field', z.strictObject({ email: z.email(withWhen) })],
  ])('refuses %s with a custom when', (_label, schema) => {
    expect(define(schema)).toThrow(/a check with a custom when callback/);
  });

  it('refuses a file size check with a custom when in a form action', () => {
    const upload = z.strictObject({ file: z.file().max(9, withWhen) });
    expect(define(upload, true)).toThrow(/at file: a check with a custom when callback/);
  });

  it("accepts zod's own default when of size and length checks", () => {
    const sized = z.strictObject({
      rows: z.array(row).min(1).max(5),
      note: z.string().min(1).max(9),
      file: z.file().min(1).max(9),
    });
    expect(define(sized, true)).not.toThrow();
  });
});

// Astra r8 B30: an empty or non-string check kind is an unknown kind, and is refused.
describe('definition: a check of an empty or non-string kind (r8 B30)', () => {
  it.each([
    ['an empty', ''],
    ['a non-string', 42],
  ])('refuses a tuple check of %s kind', (_label, kind) => {
    const tuple = z.tuple([z.string()]).check(() => {});
    const check = (tuple._zod.def.checks ?? [])[0] as { _zod: { def: { check: unknown } } };
    check._zod.def.check = kind;
    expect(define(z.strictObject({ pair: tuple }))).toThrow(ActionDefinitionError);
    expect(define(z.strictObject({ pair: tuple }))).toThrow(/at pair: a unknown check on a tuple/);
  });
});

// Lead decision on Astra r9 B28 (design addendum 8): a check whose definition holds a zod schema
// (`z.property`) parses that schema with its own checks and `when` callbacks, which the walk never
// reaches; it is refused on any node, with or without a custom `when`.
describe('definition: no check that holds a schema (addendum 8, r9 B28)', () => {
  const lengthCheck = () => z.property('length', z.number());
  it.each([
    ['on a string', z.strictObject({ note: z.string().check(lengthCheck()) }), 'note'],
    [
      'inside an array of strict objects',
      z.strictObject({ rows: z.array(z.strictObject({ name: z.string().check(lengthCheck()) })) }),
      'rows[].name',
    ],
    [
      'on a wrapper around a scalar',
      z.strictObject({
        note: z
          .string()
          .optional()
          .check(lengthCheck() as never),
      }),
      'note',
    ],
  ])('refuses a property check %s', (_label, schema, path) => {
    expect(define(schema)).toThrow(ActionDefinitionError);
    expect(define(schema)).toThrow(`at ${path}: a property check that holds a schema`);
  });
});

// Lead decision on Astra r10 B28 (design addendum 9): a check's definition is judged from its
// property descriptors before any read. An own property with no `value` (an accessor, even with
// get and set both undefined) is refused without being called, and so is a definition that does
// not inherit from Object.prototype, whose inherited properties zod would read.
describe('definition: no accessor in a check definition (addendum 9, r10 B28)', () => {
  const defOf = (schema: z.ZodType) => schema._zod.def as unknown as Record<string, unknown>;
  const checkDefOf = (schema: z.ZodType) =>
    (defOf(schema).checks as { _zod: { def: object } }[])[0]._zod.def;
  const trap = () => {
    throw new Error('accessor was read');
  };

  it('refuses a format field whose own check is a getter, without calling it', () => {
    const email = z.email();
    let reads = 0;
    Object.defineProperty(defOf(email), 'check', {
      get: () => {
        reads += 1;
        return undefined;
      },
    });
    Object.assign(defOf(email), { when: () => true, schema: z.number() });
    expect(define(z.strictObject({ email }))).toThrow(
      /at email: a check whose definition has an accessor/
    );
    expect(reads).toBe(0);
  });

  it('refuses an attached check whose when is a getter, without calling it', () => {
    const note = z.string().min(1);
    Object.defineProperty(checkDefOf(note), 'when', { get: trap });
    expect(define(z.strictObject({ note }))).toThrow(
      /at note: a check whose definition has an accessor/
    );
  });

  it('refuses an accessor whose get and set are both undefined', () => {
    const note = z.string().min(1);
    Object.defineProperty(checkDefOf(note), 'extra', { get: undefined, set: undefined });
    expect(define(z.strictObject({ note }))).toThrow(
      /at note: a check whose definition has an accessor/
    );
  });

  it('refuses a schema-holding property behind a getter, without calling it', () => {
    const rows = z.array(z.string()).min(1);
    Object.defineProperty(checkDefOf(rows), 'schema', { get: trap });
    expect(define(z.strictObject({ rows }))).toThrow(
      /at rows: a check whose definition has an accessor/
    );
  });

  it('refuses a check definition that inherits a when from its prototype', () => {
    const note = z.string().min(1);
    const check = (defOf(note).checks as { _zod: { def: object } }[])[0];
    check._zod.def = Object.assign(Object.create({ when: () => true }), check._zod.def);
    expect(define(z.strictObject({ note }))).toThrow(
      /at note: a check whose definition has an accessor or a prototype other than Object/
    );
  });
});

// Astra r11 B38: a strict object that refers to itself (zod's public getter form) is refused at
// definition with a definition error, not a stack overflow; a schema reused at sibling keys is not
// recursive and stays accepted.
describe('definition: a recursive schema (r11 B38)', () => {
  it('refuses a strict object that refers to itself through a getter', () => {
    const Tree = z.strictObject({
      name: z.string(),
      get children() {
        return z.array(Tree);
      },
    });
    expect(define(z.strictObject({ tree: Tree }))).toThrow(ActionDefinitionError);
    expect(define(z.strictObject({ tree: Tree }))).toThrow(
      'at tree.children[]: a recursive schema'
    );
  });

  it('accepts one schema reused at sibling keys', () => {
    expect(define(z.strictObject({ first: row, second: row, list: z.array(row) }))).not.toThrow();
  });
});

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

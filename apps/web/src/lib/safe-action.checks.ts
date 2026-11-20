import { z } from 'zod';

import { isActionNormalizer } from './safe-action.normalizers';

// The checks an action's input schema may carry (design addendum 4, owner approval after Astra r5
// B03/B19). Allow-list, failing closed: a check is accepted only when its kind is listed for the
// position it sits on, it carries zod's own class trait for that kind, and it has no `when` callback
// other than zod's default for that kind. Every listed kind reads the value and never writes it; zod's
// URL format is excluded because it rewrites the value it accepts (trim, tab and newline removal,
// optional normalisation), whatever `format` name its params give it.
//
//   value  a string, number, boolean, bigint, enum or literal (also inside optional/nullable/readonly)
//   date   a Date: comparisons only (a refine would receive the mutable Date object)
//   file   a form file: size and MIME type only
//   array  an array: length only
//   none   objects, tuples, unions, and wrappers around them
export type CheckContext = 'value' | 'date' | 'file' | 'array' | 'none';

type CheckInternals = {
  _zod?: { def?: { check?: unknown; when?: unknown }; traits?: { has(name: string): boolean } };
};

const internals = (check: unknown) => (check as CheckInternals)._zod;
export const kindOf = (check: unknown): string => {
  const kind = internals(check)?.def?.check;
  return typeof kind === 'string' ? kind : 'unknown';
};
const hasTrait = (check: unknown, trait: string): boolean =>
  internals(check)?.traits?.has(trait) === true;
const whenOf = (check: unknown): unknown => internals(check)?.def?.when;
const firstCheck = (schema: z.ZodType): unknown =>
  (schema._zod.def as { checks?: unknown[] }).checks?.[0];

const LENGTH_KINDS = ['min_length', 'max_length', 'length_equals'];

// zod's own class trait per accepted kind; `string_format` covers the format, regex, case and
// includes/startsWith/endsWith checks.
const KIND_TRAITS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  min_length: ['$ZodCheckMinLength'],
  max_length: ['$ZodCheckMaxLength'],
  length_equals: ['$ZodCheckLengthEquals'],
  min_size: ['$ZodCheckMinSize'],
  max_size: ['$ZodCheckMaxSize'],
  size_equals: ['$ZodCheckSizeEquals'],
  mime_type: ['$ZodCheckMimeType'],
  greater_than: ['$ZodCheckGreaterThan'],
  less_than: ['$ZodCheckLessThan'],
  multiple_of: ['$ZodCheckMultipleOf'],
  number_format: ['$ZodCheckNumberFormat'],
  bigint_format: ['$ZodCheckBigIntFormat'],
  string_format: [
    '$ZodCheckStringFormat',
    '$ZodCheckIncludes',
    '$ZodCheckStartsWith',
    '$ZodCheckEndsWith',
  ],
  // `refine`: a ZodCustom check, which receives the value only.
  custom: ['ZodCustom'],
});

const CONTEXT_KINDS: Readonly<Record<CheckContext, ReadonlySet<string>>> = Object.freeze({
  value: new Set([
    ...LENGTH_KINDS,
    'greater_than',
    'less_than',
    'multiple_of',
    'number_format',
    'bigint_format',
    'string_format',
    'custom',
  ]),
  date: new Set(['greater_than', 'less_than']),
  file: new Set(['min_size', 'max_size', 'size_equals', 'mime_type']),
  array: new Set(LENGTH_KINDS),
  none: new Set<string>(),
});

// zod gives its length and size checks a default `when` (run only on a value that has a length or
// size); any other `when` receives the writable parse payload (Astra r5 B03).
const LENGTH_WHEN = whenOf(firstCheck(z.string().min(1)));
const SIZE_WHEN = whenOf(firstCheck(z.file().min(1)));
const DEFAULT_WHEN: Readonly<Record<string, unknown>> = Object.freeze({
  min_length: LENGTH_WHEN,
  max_length: LENGTH_WHEN,
  length_equals: LENGTH_WHEN,
  min_size: SIZE_WHEN,
  max_size: SIZE_WHEN,
  size_equals: SIZE_WHEN,
});

const defaultWhen = (kind: string): unknown =>
  Object.hasOwn(DEFAULT_WHEN, kind) ? DEFAULT_WHEN[kind] : undefined;

/** Why `check` may not sit at a position of this context, or null when it may. */
export function checkProblem(check: unknown, context: CheckContext): string | null {
  if (context === 'value' && isActionNormalizer(check)) return null;
  const kind = kindOf(check);
  if (kind === 'overwrite') return 'an overwrite (only actionNormalizers may change a scalar)';
  if (kind === 'custom' && !hasTrait(check, 'ZodCustom'))
    return 'a superRefine or check callback (it can rewrite the value; use refine)';
  if (hasTrait(check, '$ZodURL')) return 'a URL format check (zod rewrites the value it accepts)';
  const when = whenOf(check);
  if (when !== undefined && when !== defaultWhen(kind))
    return 'a check with a when callback (it receives the writable payload)';
  const traits = Object.hasOwn(KIND_TRAITS, kind) ? KIND_TRAITS[kind] : [];
  if (!CONTEXT_KINDS[context].has(kind) || !traits.some(trait => hasTrait(check, trait)))
    return `a ${kind} check, which is not accepted here`;
  return null;
}

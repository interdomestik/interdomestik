import { AsyncLocalStorage } from 'node:async_hooks';
import { types } from 'node:util';
import { z } from 'zod';

import {
  adoptDataThenable,
  checkDef,
  dateTime,
  denseArray,
  hasTrait,
  holdsSchema,
  regexDefinition,
} from './safe-action.check-def';
import { normalizerOf, privateNormalizer, type Normalizer } from './safe-action.normalizers';
import { recordRefinementError, trackRefinement, type RefinementRun } from './safe-action.recheck';

export type CheckDomain = {
  type: string;
  nullable: boolean;
  optional: boolean;
  builtInOnly?: boolean;
};
type Predicate = (value: unknown) => unknown;
export type Refuse = (detail: string) => never;
type LengthKind = keyof typeof lengths;
type MeasuredType = 'string' | 'array' | 'file';
type Format = keyof typeof numericFormats;
type Comparison = 'greater_than' | 'less_than';
type CheckedValue = number | bigint | Readonly<{ time: number }>;
type Operands = keyof typeof operands;
export type CapturedCheck =
  | readonly [LengthKind, number, MeasuredType]
  | readonly [Comparison, CheckedValue, boolean]
  | readonly ['multiple_of', number | bigint]
  | readonly ['format', Format]
  | readonly ['mime_type', readonly string[]]
  | readonly ['regex', string, string]
  | readonly [Operands, string]
  | readonly ['custom', Readonly<CheckDomain>, Predicate]
  | readonly ['normalizer', Normalizer];

const lengths = {
  min_length: ['minimum', '$ZodCheckMinLength', z.minLength],
  max_length: ['maximum', '$ZodCheckMaxLength', z.maxLength],
  length_equals: ['length', '$ZodCheckLengthEquals', z.length],
  min_size: ['minimum', '$ZodCheckMinSize', z.minSize],
  max_size: ['maximum', '$ZodCheckMaxSize', z.maxSize],
  size_equals: ['size', '$ZodCheckSizeEquals', z.size],
} as const;

const numericFormats = {
  safeint: z.int,
  int32: z.int32,
  uint32: z.uint32,
  float32: z.float32,
  float64: z.float64,
  int64: z.int64,
  uint64: z.uint64,
};
const operands = {
  includes: ['includes', '$ZodCheckIncludes', z.includes],
  starts_with: ['prefix', '$ZodCheckStartsWith', z.startsWith],
  ends_with: ['suffix', '$ZodCheckEndsWith', z.endsWith],
} as const;

const refusedFormatTraits = [
  '$ZodURL',
  '$ZodIPv6',
  '$ZodCIDRv6',
  '$ZodBase64',
  '$ZodBase64URL',
  '$ZodJWT',
  '$ZodCustomStringFormat',
];
const valueTypes = new Set(['string', 'number', 'boolean', 'bigint']);
const comparisonTraits = { greater_than: '$ZodCheckGreaterThan', less_than: '$ZodCheckLessThan' };

// Zod's refine callback does not receive the parse context.
export const refinementRun = new AsyncLocalStorage<RefinementRun>();

function isKey<K extends string>(table: Record<K, unknown>, key: unknown): key is K {
  return typeof key === 'string' && Object.hasOwn(table, key);
}

function refineFor(
  domain: CheckDomain,
  predicate: Predicate
): (value: unknown) => boolean | Promise<boolean> {
  return value => {
    if (
      typeof value !== domain.type &&
      !(value === null && domain.nullable) &&
      !(value === undefined && domain.optional)
    )
      return false;
    const run = refinementRun.getStore();
    if (run?.closed) return false;
    try {
      const result: unknown = Reflect.apply(predicate, undefined, [value]);
      const adopted = adoptDataThenable(result);
      return adopted === undefined ? Boolean(result) : trackRefinement(run, adopted);
    } catch (error) {
      return recordRefinementError(run, error);
    }
  };
}

type Metadata = Readonly<Record<PropertyKey, unknown>>;

function stringCheck(check: unknown, def: Metadata, refuse: Refuse): CapturedCheck {
  const { format } = def;
  if (refusedFormatTraits.some(trait => hasTrait(check, trait))) {
    return refuse('a string format whose behaviour cannot be rebuilt from its pattern');
  }
  if (isKey(operands, format)) {
    const [key, trait] = operands[format];
    const value = def[key];
    if (!hasTrait(check, trait) || typeof value !== 'string' || Object.hasOwn(def, 'position')) {
      return refuse('a string format with an unsupported operand or position');
    }
    return [format, value];
  }
  const regex = regexDefinition(check, format, def.pattern);
  return regex
    ? ['regex', ...regex]
    : refuse('a string format without an admitted regular expression');
}

function bound(value: unknown, type: string): CheckedValue | undefined {
  if (type === 'date') {
    const time = dateTime(value);
    return time === undefined ? undefined : Object.freeze({ time });
  }
  if (type === 'number' && typeof value === 'number' && !Number.isNaN(value)) return value;
  if (type === 'bigint' && typeof value === 'bigint') return value;
  return undefined;
}

function captureAllowed(
  check: unknown,
  def: Metadata,
  kind: string,
  domain: CheckDomain,
  refuse: Refuse
): CapturedCheck | undefined {
  const { type, builtInOnly } = domain;
  const normalizer = normalizerOf(check);
  if (!builtInOnly && type === 'string' && normalizer !== undefined)
    return ['normalizer', normalizer];
  if (isKey(lengths, kind) && (type === 'string' || type === 'array' || type === 'file')) {
    const [key, trait] = lengths[kind];
    const value = def[key];
    const isSize = kind.endsWith('_size') || kind === 'size_equals';
    if (isSize === (type === 'file') && typeof value === 'number' && hasTrait(check, trait))
      return [kind, value, type];
  }
  if (isKey(comparisonTraits, kind) && hasTrait(check, comparisonTraits[kind])) {
    const value = bound(def.value, type);
    if (value !== undefined && typeof def.inclusive === 'boolean')
      return [kind, value, def.inclusive];
  }
  if (kind === 'multiple_of' && hasTrait(check, '$ZodCheckMultipleOf')) {
    const value = bound(def.value, type);
    if (typeof value === 'number' || typeof value === 'bigint') return ['multiple_of', value];
  }
  if (kind === 'mime_type' && type === 'file' && hasTrait(check, '$ZodCheckMimeType')) {
    const mime = denseArray(def.mime, 5000);
    if (mime?.every((value): value is string => typeof value === 'string')) {
      return ['mime_type', Object.freeze(mime)];
    }
  }
  if (
    kind === 'number_format' &&
    type === 'number' &&
    hasTrait(check, '$ZodCheckNumberFormat') &&
    isKey(numericFormats, def.format) &&
    def.format !== 'int64' &&
    def.format !== 'uint64'
  ) {
    return ['format', def.format];
  }
  if (
    kind === 'bigint_format' &&
    type === 'bigint' &&
    hasTrait(check, '$ZodCheckBigIntFormat') &&
    (def.format === 'int64' || def.format === 'uint64')
  ) {
    return ['format', def.format];
  }
  if (kind === 'string_format' && type === 'string') return stringCheck(check, def, refuse);
  if (
    kind === 'custom' &&
    !builtInOnly &&
    valueTypes.has(type) &&
    hasTrait(check, 'ZodCustom') &&
    typeof def.fn === 'function' &&
    !types.isProxy(def.fn) &&
    def.path === undefined &&
    def.params === undefined
  ) {
    return ['custom', Object.freeze(domain), def.fn as Predicate];
  }
  return undefined;
}

export function captureCheck(
  check: unknown,
  node: Metadata | undefined,
  domain: CheckDomain,
  position: string,
  refuse: Refuse
): CapturedCheck {
  const def = checkDef(check, node);
  if (def === null)
    return refuse(
      `a check whose definition has an accessor or a prototype other than Object (not read) on a ${position}`
    );
  const kind = typeof def.check === 'string' && def.check !== '' ? def.check : 'unknown';
  if (Object.hasOwn(def, 'when') && !isKey(lengths, kind))
    return refuse(
      `a check with a custom when callback (it receives the writable payload) on a ${position}`
    );
  if (holdsSchema(def)) return refuse(`a ${kind} check that holds a schema on a ${position}`);
  if (def.abort !== undefined && def.abort !== false) return refuse(`a ${kind} check with abort`);
  const captured = captureAllowed(check, def, kind, domain, refuse);
  if (captured === undefined) {
    if (position === 'object') {
      return refuse(
        'object-level refine/check/superRefine/overwrite belongs in the owning command'
      );
    }
    return refuse(`a ${kind} check on a ${position} belongs in the owning command`);
  }
  return Object.freeze(captured);
}

function rebuild(check: CapturedCheck): z.core.$ZodCheck {
  switch (check[0]) {
    case 'normalizer':
      return privateNormalizer(check[1]);
    case 'format':
      return numericFormats[check[1]]();
    case 'mime_type':
      return z.mime([...check[1]]);
    case 'regex':
      return z.regex(new RegExp(check[1], check[2]));
    case 'custom':
      return z.refine(refineFor(check[1], check[2]));
    case 'multiple_of':
      return z.multipleOf(check[1]);
    case 'greater_than':
    case 'less_than': {
      const value = typeof check[1] === 'object' ? new Date(check[1].time) : check[1];
      const compare =
        check[0] === 'greater_than' ? (check[2] ? z.gte : z.gt) : check[2] ? z.lte : z.lt;
      return compare(value);
    }
    case 'starts_with':
    case 'ends_with':
    case 'includes':
      return operands[check[0]][2](check[1]);
    default: {
      const measure = lengths[check[0]][2](check[1]);
      measure._zod.def.when = ({ value }) =>
        check[2] === 'array'
          ? Array.isArray(value)
          : check[2] === 'file'
            ? value instanceof File
            : typeof value === 'string';
      return measure;
    }
  }
}

export function rebuildCheck(captured: CapturedCheck): z.core.$ZodCheck {
  const check = rebuild(captured);
  const def = check._zod.def;
  Object.defineProperties(def, {
    abort: { value: false },
    when: { value: Object.hasOwn(def, 'when') ? def.when : undefined, writable: false },
  });
  Object.freeze(def);
  return check;
}

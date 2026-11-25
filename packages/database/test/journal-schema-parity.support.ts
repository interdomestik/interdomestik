// CHK-12, fourth part (R-12; DB-BASELINE DB-27, DB-28): a database built from the journal must
// equal an expected model: the declared schema (newest Drizzle snapshot, rendered through a twin),
// the reviewed drift below, and one registry of the objects SQL manages that the snapshot does
// not declare. Pure: the catalog is read elsewhere and passed in.
import { factKey } from './journal-schema-parity.catalog';

/** A fact: a key that names the object and a value that must match. */
export type CatalogFacts = ReadonlyMap<string, string>;

/** An object that only SQL manages: the snapshot does not declare its key. */
export type RegistryEntry = Readonly<{ key: string; value: string; migration: string }>;
export type Registry = Readonly<{ objects: readonly RegistryEntry[] }>;

/** A declared fact that the journal builds differently, reviewed one by one. */
export type ReviewedDrift = Readonly<{
  key: string;
  declared: string;
  built: string;
  migration: string;
  reason: string;
}>;

/** A drift value for a declared object that the journal does not build; only REVIEWED_DRIFT. */
export const ABSENT = '<absent>';

// The only fact kinds the registry may carry: SQL-only objects and their reviewed properties.
// A kind that states an abnormal condition of a built object (an invalid index, a disabled
// constraint) or any kind added later is refused until this list is reviewed.
export const REGISTRY_KINDS: ReadonlySet<string> = new Set([
  'check',
  'exclusion',
  'extension',
  'fk',
  'function',
  'index',
  'not-valid',
  'policy',
  'relation-options',
  'rls',
  'rls-force',
  'trigger',
  'view-definition',
]);

// S2 places the registry's composite primary key in SQL. Declared keys still cannot be overridden.
const LEGAL_VERSION_KEY = 'pk ["public","legal_document_versions"]';

export function isSqlManagedFact(key: string): boolean {
  return key === LEGAL_VERSION_KEY || REGISTRY_KINDS.has(key.split(' ')[0]);
}

export type ParityProblem =
  | 'missing'
  | 'unexplained'
  | 'changed'
  | 'declared-unbuildable'
  | 'registry-declares'
  | 'registry-absent'
  | 'registry-forbidden'
  | 'registry-missing'
  | 'drift-stale';

export type ParityDifference = Readonly<{
  key: string;
  problem: ParityProblem;
  expected?: string;
  actual?: string;
}>;

// The drift between the snapshot and the journal, pinned here by exact key and both values, so
// that no data file can admit another. WP-04 changes none of them: each would change mutation
// semantics, enum order or a constraint on a live table, and is the owner's to schedule.
export const REVIEWED_DRIFT: readonly ReviewedDrift[] = Object.freeze([
  {
    key: factKey('enum', ['public', 'document_category']),
    declared: '["evidence","correspondence","contract","receipt","legal","other"]',
    built: '["evidence","correspondence","contract","receipt","other","legal"]',
    migration: '0039_add_legal_claim_document_category',
    reason: "'legal' was appended by ALTER TYPE ADD VALUE; an enum's order cannot change in place.",
  },
  {
    key: factKey('fk', ['public', 'agent_clients', ['tenant_id'], 'public', 'tenants', ['id']]),
    declared: 'delete=cascade update=no action match=s',
    built: 'delete=no action update=no action match=s',
    migration: '0008_add_multitenant',
    reason: 'The schema declares ON DELETE CASCADE; the journal created the key with NO ACTION.',
  },
  {
    key: factKey('fk', [
      'public',
      'crm_routing_rules',
      ['branch_id'],
      'public',
      'branches',
      ['id'],
    ]),
    declared: 'delete=no action update=no action match=s',
    built: ABSENT,
    migration: '0067_motionless_chamber',
    reason:
      'Declared since snapshot 0067 with no SQL; the composite tenant-and-branch key (declared, created by 0064) holds the rule.',
  },
  {
    key: factKey('check', ['public', 'sponsors', 'sponsors_legal_name_check']),
    declared: "(btrim(legal_name) <> ''::text)",
    built: '(length(btrim(legal_name)) > 0)',
    migration: '0099_acq3b_sponsor_seats',
    reason:
      'The schema and 0099 spell the same rule differently; both accept and refuse the same values.',
  },
]);

/** Code-unit order: stable across locales, and the order of the registry file. */
export const byCodeUnit = (left: string, right: string) =>
  left < right ? -1 : Number(left > right);

/** The declared model: structural facts plus the facts PostgreSQL rendered from the twin. */
export function declaredModel(
  structural: ReadonlyMap<string, string>,
  rendered: ReadonlyMap<string, string>
): Map<string, string> {
  const declared = new Map(structural);
  for (const [key, value] of rendered) {
    if (declared.has(key)) throw new Error(`the declared model states ${key} twice`);
    declared.set(key, value);
  }
  return declared;
}

function expectedModel(
  declared: ReadonlyMap<string, string>,
  registry: Registry,
  drift: readonly ReviewedDrift[]
) {
  const differences: ParityDifference[] = [];
  const expected = new Map(declared);
  const registered = new Set<string>();
  for (const entry of drift) {
    if (declared.get(entry.key) !== entry.declared) {
      differences.push({
        key: entry.key,
        problem: 'drift-stale',
        expected: entry.declared,
        actual: declared.get(entry.key),
      });
    }
    expected.set(entry.key, entry.built);
  }
  for (const entry of registry.objects) {
    if (registered.has(entry.key)) throw new Error(`duplicate registry key ${entry.key}`);
    registered.add(entry.key);
    // A registry entry names an object that must be built; it can never admit an absence.
    if (entry.value === ABSENT) {
      differences.push({ key: entry.key, problem: 'registry-absent', expected: entry.value });
      continue;
    }
    if (!isSqlManagedFact(entry.key)) {
      differences.push({ key: entry.key, problem: 'registry-forbidden', actual: entry.value });
      continue;
    }
    // The registry may only add what the snapshot does not declare; it never overrides.
    if (declared.has(entry.key)) {
      differences.push({
        key: entry.key,
        problem: 'registry-declares',
        expected: declared.get(entry.key),
        actual: entry.value,
      });
      continue;
    }
    expected.set(entry.key, entry.value);
  }
  return { expected, registered, differences };
}

/**
 * Compares a built database with the expected model. Every built fact must be expected and
 * every expected fact built, with the same value; `unbuildable` lists declared facts whose twin
 * statement PostgreSQL refused.
 */
export function compareWithExpectedModel(
  declared: ReadonlyMap<string, string>,
  registry: Registry,
  built: CatalogFacts,
  options: Readonly<{
    drift?: readonly ReviewedDrift[];
    unbuildable?: readonly Readonly<{ key: string; error: string }>[];
  }> = {}
): ParityDifference[] {
  const { expected, registered, differences } = expectedModel(
    declared,
    registry,
    options.drift ?? REVIEWED_DRIFT
  );
  for (const { key, error } of options.unbuildable ?? []) {
    differences.push({ key, problem: 'declared-unbuildable', actual: error });
  }
  for (const [key, value] of expected) {
    const actual = built.get(key);
    if (value === ABSENT) {
      if (actual !== undefined)
        differences.push({ key, problem: 'changed', expected: ABSENT, actual });
    } else if (actual === undefined) {
      differences.push({
        key,
        problem: registered.has(key) ? 'registry-missing' : 'missing',
        expected: value,
      });
    } else if (actual !== value) {
      differences.push({ key, problem: 'changed', expected: value, actual });
    }
  }
  for (const [key, actual] of built) {
    if (!expected.has(key)) differences.push({ key, problem: 'unexplained', actual });
  }
  return differences.sort((left, right) => byCodeUnit(left.key, right.key));
}

/** Independent of the registry: no tenant column has a default (R-17). */
export function tenantDefaults(built: CatalogFacts): string[] {
  return [...built.keys()].filter(
    key => key.startsWith('default ') && JSON.parse(key.slice(8)).at(-1) === 'tenant_id'
  );
}

/** Independent of the registry: every declared index is built. */
export function missingDeclaredIndexes(declared: CatalogFacts, built: CatalogFacts): string[] {
  return [...declared.keys()].filter(key => key.startsWith('index ') && !built.has(key));
}

export function describeDifferences(differences: readonly ParityDifference[]): string {
  return differences
    .map(({ key, problem, expected, actual }) =>
      [
        problem,
        key,
        expected === undefined ? '' : `expected=${expected}`,
        actual === undefined ? '' : `actual=${actual}`,
      ]
        .filter(Boolean)
        .join(' ')
    )
    .join('\n');
}

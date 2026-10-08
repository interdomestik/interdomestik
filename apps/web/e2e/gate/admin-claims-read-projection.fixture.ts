/** Contractual ids of the shipped admin claims read recovery; the projection targets only these. */
export const ADMIN_CLAIMS_READ = {
  headingId: 'admin-claims-heading',
  regionTestId: 'admin-claims-read-region',
  recoveryTestId: 'admin-claims-read-recovery',
  resultTestId: 'admin-claims-read-result',
} as const;

/** Payload-free seam failure: messages never carry URLs, headers, cookies or bodies. */
export class AdminClaimsReadSeamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminClaimsReadSeamError';
  }
}

export function invalid(what: string): never {
  throw new AdminClaimsReadSeamError(`S7 admin claims read seam: ${what}`);
}

type Json = Record<string, unknown>;
type FlightElement = [string, unknown, unknown, Json, ...unknown[]];

// Observed Next RSC framing: one record per line, "<hexId>:<JSON>". Rows that do not start with an
// array or object (imports, hints, text rows) are framing and are never parsed or rewritten.
const RECORD_LINE = /^([0-9a-f]+):([[{][\s\S]*?)(\r?)$/;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isElement(value: unknown): value is FlightElement {
  return Array.isArray(value) && value[0] === '$' && isRecord(value[3]);
}

function isRecoveryProps(value: unknown): value is Json {
  return (
    isRecord(value) &&
    value.headingId === ADMIN_CLAIMS_READ.headingId &&
    value.regionTestId === ADMIN_CLAIMS_READ.regionTestId &&
    value.recoveryTestId === ADMIN_CLAIMS_READ.recoveryTestId
  );
}

function collect(value: unknown, found: Json[] = []): Json[] {
  if (Array.isArray(value)) {
    value.forEach(item => collect(item, found));
  } else if (isRecord(value)) {
    if (isRecoveryProps(value)) found.push(value);
    Object.values(value).forEach(child => collect(child, found));
  }
  return found;
}

// Immutable structural rewrite: input values are never mutated, only rebuilt along the path.
function rewrite(value: unknown, transform: (props: Json) => Json): unknown {
  if (Array.isArray(value)) return value.map(item => rewrite(item, transform));
  if (!isRecord(value)) return value;
  if (isRecoveryProps(value)) return transform(value);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, transform)]));
}

/** Locates the single record that carries the recovery props; throws payload-free otherwise. */
function locate(body: string) {
  const lines = body.split('\n');
  const records = lines.flatMap((line, index) => {
    const match = RECORD_LINE.exec(line);
    if (!match) return [];
    const [, id = '', json = '', tail = ''] = match;
    try {
      const value: unknown = JSON.parse(json);
      return [{ index, id, tail, value, props: collect(value) }];
    } catch {
      return [];
    }
  });
  const total = records.reduce((sum, record) => sum + record.props.length, 0);
  const hit = records.find(record => record.props.length > 0);
  const [props] = hit?.props ?? [];
  if (total !== 1 || !hit || !props) {
    return invalid(`expected exactly one recovery props object, found ${total}`);
  }
  return { lines, hit, props };
}

// The expected successful structure: [filter, persistent result output, success content].
function readSuccess(props: Json) {
  const children = props.children;
  if (props.message !== null) invalid('recovery props are not a successful read');
  if (!Array.isArray(children) || children.length !== 3) invalid('unexpected children shape');
  const [filter, output, content] = children as unknown[];
  if (!isElement(filter)) invalid('filter child missing');
  const filterProps = filter[3];
  const keys = Object.keys(filterProps).sort();
  // The production build adds these observed source-only Sentry attributes; preserve them.
  const instrumented =
    keys.join(',') === 'data-sentry-element,data-sentry-source-file' &&
    filterProps['data-sentry-element'] === 'AdminClaimsFilters' &&
    filterProps['data-sentry-source-file'] === 'AdminClaimsV2Page.tsx';
  if (keys.length !== 0 && !instrumented) invalid('unexpected filter props');
  if (!isElement(output) || output[1] !== 'output') invalid('result output missing');
  if (output[3]['data-testid'] !== ADMIN_CLAIMS_READ.resultTestId) invalid('wrong result output');
  const announcement = output[3].children;
  if (typeof announcement !== 'string' || announcement.trim() === '') {
    invalid('result output is not announced');
  }
  if (content === false || content === null || content === undefined) {
    invalid('success content missing');
  }
  return { filter, output, announcement };
}

/** Read-only: requires EXACTLY ONE successful target and returns its announced result text. */
export function readAdminClaimsResult(body: string): string {
  return readSuccess(locate(body).props).announcement;
}

/**
 * Projects only the read of the single recovery props object into a failed read: message becomes
 * the localized catalog failure, the actual filter child is kept, the success content becomes
 * `false` and the persistent result output keeps its element with empty children. Unrelated
 * records and framing stay byte-identical. Throws payload-free before any mutation unless the
 * actual response has the expected successful structure.
 */
export function failAdminClaimsRead(body: string, failureMessage: string): string {
  if (failureMessage.trim() === '') invalid('failure message is empty');
  const { lines, hit, props } = locate(body);
  const { filter, output } = readSuccess(props);
  const emptied = [output[0], output[1], output[2], { ...output[3], children: '' }];
  const failed = rewrite(hit.value, target => ({
    ...target,
    message: failureMessage,
    children: [filter, [...emptied, ...output.slice(4)], false],
  }));
  lines[hit.index] = `${hit.id}:${JSON.stringify(failed)}${hit.tail}`;
  return lines.join('\n');
}

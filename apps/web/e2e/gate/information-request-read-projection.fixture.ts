export type ReadResultAudience = 'member' | 'staff';

export type ReadResultTarget = {
  readonly audience: ReadResultAudience;
  readonly claimId: string;
  /** Locale-prefixed detail pathname; only GETs for exactly this pathname are ever handled. */
  readonly pathname: string;
};

/** Payload-free seam failure: messages never carry URLs, headers, cookies or bodies. */
export class ReadSeamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadSeamError';
  }
}

// Observed Next RSC framing: one record per line, "<hexId>:<JSON>". Rows that do not start with
// an array or object (imports, hints, text rows) are framing and are never parsed or rewritten.
const RECORD_LINE = /^([0-9a-f]+):([[{][\s\S]*?)(\r?)$/;

function isTargetProps(value: Record<string, unknown>, target: ReadResultTarget): boolean {
  return (
    value.audience === target.audience &&
    value.claimId === target.claimId &&
    (value.requests === null || Array.isArray(value.requests))
  );
}

function walk(
  value: unknown,
  target: ReadResultTarget,
  visit: (props: Record<string, unknown>) => void
): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((total, item) => total + walk(item, target, visit), 0);
  }
  if (value === null || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  // Capture children before any callback so a mutation of this record cannot change traversal.
  const children = Object.values(record);
  const own = isTargetProps(record, target);
  if (own) {
    visit(record);
  }
  return children.reduce<number>((total, child) => total + walk(child, target, visit), own ? 1 : 0);
}

type Located = {
  lines: string[];
  hit: { index: number; id: string; tail: string; value: unknown };
};

/** Locates the single record with the target props; throws payload-free on none or many. */
function locate(body: string, target: ReadResultTarget): Located {
  const lines = body.split('\n');
  const records = lines.flatMap((line, index) => {
    const match = RECORD_LINE.exec(line);
    if (!match) return [];
    const [, id = '', json = '', tail = ''] = match;
    try {
      const value: unknown = JSON.parse(json);
      return [{ index, id, tail, value, hits: walk(value, target, () => undefined) }];
    } catch {
      return [];
    }
  });
  const total = records.reduce((sum, record) => sum + record.hits, 0);
  const hit = records.find(record => record.hits > 0);
  if (total !== 1 || !hit) {
    throw new ReadSeamError(
      `S7 read-result seam expected exactly one ${target.audience} props object, found ${total}`
    );
  }
  return { lines, hit };
}

/**
 * Structurally fails the information-request read of one case: requires EXACTLY ONE client props
 * object for the expected audience and claim and sets only its `requests` to null. Other fields
 * in that record are preserved semantically; unrelated records and framing stay byte-identical.
 * Throws a
 * payload-free error when the match is missing or ambiguous.
 */
export function failInformationRequestRead(body: string, target: ReadResultTarget): string {
  const { lines, hit } = locate(body, target);
  walk(hit.value, target, props => {
    props.requests = null;
  });
  lines[hit.index] = `${hit.id}:${JSON.stringify(hit.value)}${hit.tail}`;
  return lines.join('\n');
}

/** Read-only: returns the `requests` value of EXACTLY ONE target props object. */
export function readInformationRequests(body: string, target: ReadResultTarget): unknown {
  const { hit } = locate(body, target);
  const seen: unknown[] = [];
  walk(hit.value, target, props => {
    seen.push(props.requests);
  });
  return seen[0];
}

/** Read-only counterpart: requires EXACTLY ONE target props object whose `requests` is []. */
export function verifyEmptyInformationRequestRead(body: string, target: ReadResultTarget): void {
  const requests = readInformationRequests(body, target);
  if (!Array.isArray(requests) || requests.length !== 0) {
    throw new ReadSeamError(`S7 read-result seam expected an empty ${target.audience} read`);
  }
}

/** Initial-phase guard: EXACTLY ONE target props object with an actual requests list. */
export function requireListedInformationRequestRead(body: string, target: ReadResultTarget): void {
  if (!Array.isArray(readInformationRequests(body, target))) {
    throw new ReadSeamError(
      `S7 read-result seam expected an actual ${target.audience} requests list`
    );
  }
}

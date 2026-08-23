import { createHash } from 'node:crypto';

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
export const CANONICAL_ORIGIN = 'https://github.com/interdomestik/interdomestik';
const PROGRAM = 'IDA-WF01-ONE-APPROVAL-DELIVERY';
const ENVELOPE_PATH = 'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json';
const RECEIPT_PATH =
  'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json';
const DURABLE_KEYS =
  'schemaVersion,programId,revision,status,childId,runtimeAuthorized,successorsBlocked,envelopeSha256,approvalReceiptSha256,boundary,evidenceRef,previousOperationSha256,operationSha256'.split(
    ','
  );
const PROJECTION_KEYS =
  'schemaVersion,programId,envelopePath,envelopeSha256,approvalReceiptPath,approvalReceiptSha256,liveDispositionRequired,repositoryConsumptionRule'.split(
    ','
  );
const FAILURE_STATUSES = new Set(['failed_consumed', 'rolled_back_consumed', 'incident', 'failed']);
const STATUSES = new Set(
  'active,prepared,installing,merged_consumed,installed_consumed,closeout_required,failed_consumed,rolled_back_consumed,incident,failed,closed'.split(
    ','
  )
);

function must(value, message) {
  if (!value) throw new Error(message);
}

export const alphabetical = (left, right) => left.localeCompare(right, 'en');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sha256 = value => createHash('sha256').update(value).digest('hex');
export const canonicalJsonDigest = value => sha256(`${JSON.stringify(value, null, 2)}\n`);

export function normalizeOrigin(value) {
  return typeof value === 'string'
    ? value
        .replace(/^ssh:\/\/git@github\.com\//u, 'https://github.com/')
        .replace(/^git@github\.com:/u, 'https://github.com/')
        .replace(/\/$/u, '')
        .replace(/\.git$/u, '')
    : '';
}

function exactKeys(value, keys, label) {
  must(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  must(
    same(Object.keys(value).sort(alphabetical), [...keys].sort(alphabetical)),
    `${label} keys mismatch`
  );
}

function safePaths(paths) {
  must(
    Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length,
    'invalid writer paths'
  );
  must(
    paths.every(
      path =>
        typeof path === 'string' &&
        path.length > 0 &&
        !path.startsWith('/') &&
        !path.startsWith('../') &&
        !path.includes('/../')
    ),
    'unsafe writer path'
  );
}

export function writerMapDigest(paths) {
  safePaths(paths);
  return sha256(JSON.stringify([...paths].sort(alphabetical)));
}

export function validateProjection(value) {
  exactKeys(value, PROJECTION_KEYS, 'projection');
  must(value.schemaVersion === 1 && value.programId === PROGRAM, 'projection schema mismatch');
  must(value.envelopePath === ENVELOPE_PATH, 'projection envelope path mismatch');
  must(value.approvalReceiptPath === RECEIPT_PATH, 'projection receipt path mismatch');
  must(
    SHA256.test(value.envelopeSha256) && SHA256.test(value.approvalReceiptSha256),
    'projection hash mismatch'
  );
  must(value.liveDispositionRequired === 'open', 'projection live disposition mismatch');
  must(
    value.repositoryConsumptionRule === 'merged_closed_or_terminal_failure',
    'projection consumption rule mismatch'
  );
  return value;
}

function envelopeChildren(envelope) {
  const children = envelope?.approvalEnvelope?.children;
  must(Array.isArray(children) && children.length > 0, 'envelope children missing');
  const ids = new Set();
  let previousOrder = null;
  for (const child of children) {
    must(
      Number.isSafeInteger(child?.order) &&
        typeof child.childId === 'string' &&
        typeof child.controlPlane === 'string',
      'invalid envelope child'
    );
    must(!ids.has(child.childId), 'duplicate envelope child');
    must(previousOrder === null || child.order === previousOrder + 1, 'non-sequential envelope');
    safePaths(child.writerPaths);
    ids.add(child.childId);
    previousOrder = child.order;
  }
  return children;
}

export function validateProjectionArtifacts({
  projection,
  envelope,
  approvalReceipt,
  artifactHashes,
}) {
  validateProjection(projection);
  envelopeChildren(envelope);
  must(approvalReceipt && typeof approvalReceipt === 'object', 'approval receipt missing');
  exactKeys(artifactHashes, ['envelopeSha256', 'approvalReceiptSha256'], 'artifact hashes');
  must(
    artifactHashes.envelopeSha256 === projection.envelopeSha256 &&
      artifactHashes.approvalReceiptSha256 === projection.approvalReceiptSha256,
    'projection artifact mismatch'
  );
  return true;
}

function validateBoundary(boundary) {
  exactKeys(
    boundary,
    boundary?.kind === 'git' ? ['kind', 'B', 'H', 'T', 'M'] : ['kind', 'postimageSha256'],
    'durable boundary'
  );
  if (boundary.kind === 'git') {
    must(
      [boundary.B, boundary.H, boundary.T, boundary.M].every(value => SHA40.test(value)),
      'durable boundary mismatch'
    );
  } else {
    must(
      boundary.kind === 'local' && SHA256.test(boundary.postimageSha256),
      'durable boundary mismatch'
    );
  }
}

function validateDurable(record) {
  exactKeys(record, DURABLE_KEYS, 'durable record');
  const { operationSha256, ...state } = record;
  must(
    SHA256.test(operationSha256) && sha256(JSON.stringify(state)) === operationSha256,
    'durable operation mismatch'
  );
  must(state.schemaVersion === 1 && state.programId === PROGRAM, 'durable schema mismatch');
  must(Number.isSafeInteger(state.revision) && state.revision > 0, 'durable revision mismatch');
  must(STATUSES.has(state.status) && typeof state.childId === 'string', 'durable state mismatch');
  must(
    !['closed', 'closeout_required'].includes(state.status) ||
      state.childId === 'S4B-reviewer-policy',
    'durable terminal state mismatch'
  );
  must(
    state.runtimeAuthorized === /^(active|prepared|installing)$/u.test(state.status),
    'durable authorization mismatch'
  );
  must(
    state.successorsBlocked === FAILURE_STATUSES.has(state.status),
    'durable successor mismatch'
  );
  must(
    [state.envelopeSha256, state.approvalReceiptSha256].every(value => SHA256.test(value)),
    'durable artifact mismatch'
  );
  must(
    /^evidence\/[A-Za-z0-9-]+-[0-9a-f]{64}\.json$/u.test(state.evidenceRef),
    'durable evidence mismatch'
  );
  must(
    state.revision === 1
      ? state.previousOperationSha256 === null
      : SHA256.test(state.previousOperationSha256),
    'durable predecessor mismatch'
  );
  validateBoundary(state.boundary);
}

function validateHistory(history, durable, children, projection) {
  must(Array.isArray(history) && history.length === durable.revision, 'durable history incomplete');
  const childIndex = new Map(children.map((child, index) => [child.childId, index]));
  for (let index = 0; index < history.length; index += 1) {
    const current = history[index];
    const previous = history[index - 1];
    validateDurable(current);
    must(current.revision === index + 1, 'durable history gap');
    must(childIndex.has(current.childId), 'unlisted durable child');
    if (!previous) {
      must(current.childId === children[0].childId, 'durable history starts at wrong child');
      continue;
    }
    must(
      current.previousOperationSha256 === previous.operationSha256,
      'durable history chain mismatch'
    );
    const movement = childIndex.get(current.childId) - childIndex.get(previous.childId);
    must(movement === 0 || movement === 1, 'durable child sequence mismatch');
    if (movement === 1)
      must(same(current.boundary, previous.boundary), 'successor boundary mismatch');
    const artifactChanged =
      current.envelopeSha256 !== previous.envelopeSha256 ||
      current.approvalReceiptSha256 !== previous.approvalReceiptSha256;
    if (artifactChanged) {
      must(
        movement === 0 &&
          current.envelopeSha256 !== previous.envelopeSha256 &&
          current.approvalReceiptSha256 !== previous.approvalReceiptSha256,
        'invalid authority artifact rebind'
      );
    }
  }
  must(same(history.at(-1), durable), 'durable current/history mismatch');
  must(
    durable.envelopeSha256 === projection.envelopeSha256 &&
      durable.approvalReceiptSha256 === projection.approvalReceiptSha256,
    'durable artifact mismatch'
  );
}

export function deriveAuthorityContext(source) {
  validateProjectionArtifacts(source);
  const children = envelopeChildren(source.envelope);
  validateDurable(source.durable);
  validateHistory(source.history, source.durable, children, source.projection);
  const child = children.find(item => item.childId === source.durable.childId);
  const repository = /repository PR/u.test(child.controlPlane);
  if (repository)
    must(source.durable.boundary.kind === 'git', 'repository child requires Git boundary');
  return {
    programId: PROGRAM,
    childId: child.childId,
    operationSha256: source.durable.operationSha256,
    base: repository ? source.durable.boundary.M : null,
    writerPaths: [...child.writerPaths],
    writerMapSha256: writerMapDigest(child.writerPaths),
    liveDispositionRequired: source.projection.liveDispositionRequired,
  };
}

export function validateProjectionDocuments(projection, program, tracker) {
  validateProjection(projection);
  const pattern = /The next active governed implementation goal[^\n]+/gu;
  const programMarkers = program.match(pattern) ?? [];
  const trackerMarkers = tracker.match(pattern) ?? [];
  must(
    programMarkers.length === 1 && trackerMarkers.length === 1,
    'projection marker count mismatch'
  );
  must(programMarkers[0] === trackerMarkers[0], 'projection marker disagreement');
  must(
    programMarkers[0].includes(`\`${projection.programId}\``),
    'projection marker program mismatch'
  );
  must(
    programMarkers[0].includes('`runtime_authorized:external`'),
    'projection marker runtime mismatch'
  );
  return true;
}

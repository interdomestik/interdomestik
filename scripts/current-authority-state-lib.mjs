import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
export const CANONICAL_ORIGIN = 'https://github.com/interdomestik/interdomestik';
const DURABLE_KEYS =
  'schemaVersion,programId,revision,status,childId,runtimeAuthorized,successorsBlocked,envelopeSha256,approvalReceiptSha256,boundary,evidenceRef,previousOperationSha256,operationSha256'.split(
    ','
  );
const FAILURE_STATUSES = new Set(['failed_consumed', 'rolled_back_consumed', 'incident', 'failed']);
const DURABLE_STATUSES = new Set(
  'active,prepared,installing,merged_consumed,installed_consumed,closeout_required,failed_consumed,rolled_back_consumed,incident,failed,closed'.split(
    ','
  )
);
const PROJECTION_KEYS =
  'schemaVersion,programId,sourceMain,projectedRevision,projectedChild,projectedOperationSha256,envelopeSha256,approvalReceiptSha256,writerPaths,writerMapSha256,liveDispositionRequired,repositoryConsumptionRule,successorAfterHealthCleanup'.split(
    ','
  );

function must(value, message) {
  if (!value) throw new Error(message);
}

export const alphabetical = (left, right) => left.localeCompare(right, 'en');

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
  const actual = Object.keys(value).sort(alphabetical);
  must(
    JSON.stringify(actual) === JSON.stringify([...keys].sort(alphabetical)),
    `${label} keys mismatch`
  );
}

function validateDurableRecord(record) {
  exactKeys(record, DURABLE_KEYS, 'durable record');
  const { operationSha256, ...state } = record;
  must(
    SHA256.test(operationSha256) &&
      createHash('sha256').update(JSON.stringify(state)).digest('hex') === operationSha256,
    'durable operation mismatch'
  );
  must(
    state.schemaVersion === 1 && state.programId === 'IDA-WF01-ONE-APPROVAL-DELIVERY',
    'durable schema mismatch'
  );
  must(Number.isSafeInteger(state.revision) && state.revision > 0, 'durable revision mismatch');
  must(
    DURABLE_STATUSES.has(state.status) && typeof state.childId === 'string',
    'durable state mismatch'
  );
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
  must(SHA256.test(state.previousOperationSha256), 'durable predecessor mismatch');
  exactKeys(
    state.boundary,
    state.boundary?.kind === 'git' ? ['kind', 'B', 'H', 'T', 'M'] : ['kind', 'postimageSha256'],
    'durable boundary'
  );
  if (state.boundary.kind === 'git') {
    must(
      [state.boundary.B, state.boundary.H, state.boundary.T, state.boundary.M].every(value =>
        SHA40.test(value)
      ),
      'durable boundary mismatch'
    );
  } else {
    must(
      state.boundary.kind === 'local' && SHA256.test(state.boundary.postimageSha256),
      'durable boundary mismatch'
    );
  }
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

function exactRuntimeIdentity(live) {
  exactKeys(
    live,
    [
      'operationSha256',
      'childId',
      'disposition',
      'pullRequestNumber',
      'pullRequestState',
      'terminalFailure',
      'origin',
      'base',
      'head',
      'testedMerge',
      'protectedMain',
      'writerMapSha256',
      'worktree',
      'mcp',
    ],
    'live identity'
  );
  exactKeys(live.worktree, ['root', 'commonDir', 'head'], 'worktree identity');
  exactKeys(
    live.mcp,
    [
      'sourceRoot',
      'sourceHead',
      'sourceCommonDir',
      'targetRoot',
      'targetHead',
      'targetCommonDir',
      'repoRoot',
    ],
    'MCP identity'
  );
  const paths = [
    live.worktree.root,
    live.worktree.commonDir,
    live.mcp.sourceRoot,
    live.mcp.sourceCommonDir,
    live.mcp.targetRoot,
    live.mcp.targetCommonDir,
    live.mcp.repoRoot,
  ];
  must(
    paths.every(value => typeof value === 'string' && isAbsolute(value)),
    'runtime path mismatch'
  );
  must(
    Number.isSafeInteger(live.pullRequestNumber) && live.pullRequestNumber > 0,
    'pull request mismatch'
  );
  must(live.worktree.head === live.head, 'worktree head mismatch');
  must(live.mcp.sourceRoot !== live.mcp.targetRoot, 'MCP source/target collision');
  must(SHA40.test(live.mcp.sourceHead), 'MCP source head mismatch');
  must(live.mcp.targetRoot === live.worktree.root, 'MCP target root mismatch');
  must(live.mcp.targetHead === live.head, 'MCP target head mismatch');
  must(live.mcp.repoRoot === live.worktree.root, 'MCP repoRoot mismatch');
  must(
    live.mcp.sourceCommonDir === live.worktree.commonDir &&
      live.mcp.targetCommonDir === live.worktree.commonDir,
    'Git common directory mismatch'
  );
}

export function writerMapDigest(paths) {
  safePaths(paths);
  const canonical = JSON.stringify([...paths].sort(alphabetical));
  return createHash('sha256').update(canonical).digest('hex');
}

export function validateProjection(value) {
  exactKeys(value, PROJECTION_KEYS, 'projection');
  must(value.schemaVersion === 1, 'projection schema mismatch');
  must(value.programId === 'IDA-WF01-ONE-APPROVAL-DELIVERY', 'projection program mismatch');
  must(SHA40.test(value.sourceMain), 'projection source main mismatch');
  must(
    Number.isSafeInteger(value.projectedRevision) && value.projectedRevision > 0,
    'projection revision mismatch'
  );
  must(value.projectedChild === 'S3-exact-authority', 'projection child mismatch');
  must(
    [value.projectedOperationSha256, value.envelopeSha256, value.approvalReceiptSha256].every(
      item => SHA256.test(item)
    ),
    'projection hash mismatch'
  );
  must(
    writerMapDigest(value.writerPaths) === value.writerMapSha256,
    'projection writer map mismatch'
  );
  must(value.liveDispositionRequired === 'open', 'projection live disposition mismatch');
  must(
    value.repositoryConsumptionRule === 'merged_closed_or_terminal_failure',
    'projection consumption rule mismatch'
  );
  must(
    value.successorAfterHealthCleanup === 'S4A-terminal-delivery',
    'projection successor mismatch'
  );
  return value;
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
    programMarkers[0].includes('`runtime_authorized:true`'),
    'projection marker runtime mismatch'
  );
  return true;
}

function fail(reason, successorsBlocked = true) {
  return { runtimeAuthorized: false, activeSlice: null, successorsBlocked, reason };
}

export function resolveCurrentAuthority({ projection, durable, live }) {
  try {
    validateProjection(projection);
    validateDurableRecord(durable);
    must(durable && durable.revision === projection.projectedRevision, 'durable revision mismatch');
    must(durable.childId === projection.projectedChild, 'durable child mismatch');
    must(
      durable.operationSha256 === projection.projectedOperationSha256,
      'durable operation mismatch'
    );
    must(durable.envelopeSha256 === projection.envelopeSha256, 'durable envelope mismatch');
    must(
      durable.approvalReceiptSha256 === projection.approvalReceiptSha256,
      'durable receipt mismatch'
    );
    if (!durable.runtimeAuthorized) return fail('authority_not_active', durable.successorsBlocked);
    must(live && typeof live === 'object', 'live identity unavailable');
    exactRuntimeIdentity(live);
    must(live.operationSha256 === durable.operationSha256, 'stale live operation');
    must(
      live.childId === durable.childId && live.disposition === 'open',
      'inactive live authority'
    );
    if (live.terminalFailure) return fail('terminal_failure');
    if (['MERGED', 'CLOSED'].includes(live.pullRequestState)) {
      return fail('authority_consumed_by_merge', false);
    }
    must(live.pullRequestState === 'OPEN', 'unknown pull request state');
    must(normalizeOrigin(live.origin) === CANONICAL_ORIGIN, 'origin mismatch');
    must(
      live.base === projection.sourceMain && live.protectedMain === projection.sourceMain,
      'base/main mismatch'
    );
    must(SHA40.test(live.head) && SHA40.test(live.testedMerge), 'head/tested merge mismatch');
    must(live.writerMapSha256 === projection.writerMapSha256, 'live writer map mismatch');
    return { ...durable, activeSlice: durable.childId };
  } catch {
    return fail('invalid_authority_projection');
  }
}

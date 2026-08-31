import { canonicalJson, exactKeys, must, sha256 } from './slice-rehearse-canonical.mjs';

const RESOLVER_COMMAND = 'node scripts/lean-current-authority.mjs status';
const EVIDENCE_KEYS = ['resolverCommand', 'result', 'resultDigest', 'source'];
const REQUIRED_RESULT_KEYS = [
  'activeSlice',
  'closeoutAuthorized',
  'lifecycle',
  'reason',
  'runtimeAuthorized',
  'successorsBlocked',
];

export const AUTHORITY_BOUNDARIES = Object.freeze([
  'pre_work',
  'candidate_freeze',
  'pre_push',
  'pre_pr',
  'pre_merge',
  'post_merge',
  'pre_cleanup',
]);

function assertCompleteResult(result) {
  must(
    result && typeof result === 'object' && !Array.isArray(result),
    'live resolver returned an incomplete authority state'
  );
  must(
    REQUIRED_RESULT_KEYS.every(key => Object.hasOwn(result, key)),
    'live resolver returned an incomplete authority state'
  );
  must(
    typeof result.lifecycle === 'string' && result.lifecycle.length > 0,
    'live resolver returned an incomplete authority state'
  );
  must(
    typeof result.reason === 'string' && result.reason.length > 0,
    'live resolver returned an incomplete authority state'
  );
  must(
    typeof result.runtimeAuthorized === 'boolean',
    'live resolver returned an incomplete authority state'
  );
  must(
    typeof result.successorsBlocked === 'boolean',
    'live resolver returned an incomplete authority state'
  );
  must(
    typeof result.closeoutAuthorized === 'boolean',
    'live resolver returned an incomplete authority state'
  );
  must(
    result.activeSlice === null || typeof result.activeSlice === 'string',
    'live resolver returned an incomplete authority state'
  );
  return result;
}

export function authenticateResolverOutput(result) {
  const complete = assertCompleteResult(result);
  return {
    source: 'live-resolver',
    resolverCommand: RESOLVER_COMMAND,
    resultDigest: sha256(canonicalJson(complete)),
    result: complete,
  };
}

export function resolveAtAuthorityBoundary({ boundary, readLiveAuthority }) {
  must(
    AUTHORITY_BOUNDARIES.includes(boundary),
    'resolver refresh requires an explicit authority boundary'
  );
  must(typeof readLiveAuthority === 'function', 'live resolver adapter is unavailable');
  const evidence = readLiveAuthority();
  must(evidence?.source === 'live-resolver', 'authority must use live resolver evidence');
  exactKeys(evidence, EVIDENCE_KEYS, 'live resolver evidence');
  must(evidence.resolverCommand === RESOLVER_COMMAND, 'live resolver command differs');
  const result = assertCompleteResult(evidence.result);
  must(
    evidence.resultDigest === sha256(canonicalJson(result)),
    'live resolver evidence digest differs'
  );
  return {
    boundary,
    source: 'live-resolver',
    authority: {
      ...result,
      source: 'live-resolver',
      resolverCommand: evidence.resolverCommand,
      resultDigest: evidence.resultDigest,
    },
  };
}

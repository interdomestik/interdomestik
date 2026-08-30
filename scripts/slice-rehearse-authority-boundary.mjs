import { must } from './slice-rehearse-canonical.mjs';

export const AUTHORITY_BOUNDARIES = Object.freeze([
  'pre_work',
  'candidate_freeze',
  'pre_push',
  'pre_pr',
  'pre_merge',
  'post_merge',
  'pre_cleanup',
]);

export function resolveAtAuthorityBoundary({ boundary, readLiveAuthority }) {
  must(
    AUTHORITY_BOUNDARIES.includes(boundary),
    'resolver refresh requires an explicit authority boundary'
  );
  must(typeof readLiveAuthority === 'function', 'live resolver adapter is unavailable');
  const authority = readLiveAuthority();
  must(
    authority?.source === undefined || authority.source === 'live-resolver',
    'authority must use live resolver evidence'
  );
  must(
    authority &&
      typeof authority === 'object' &&
      typeof authority.runtimeAuthorized === 'boolean' &&
      Object.hasOwn(authority, 'activeSlice'),
    'live resolver returned an incomplete authority state'
  );
  return {
    boundary,
    source: 'live-resolver',
    authority: { ...authority, source: 'live-resolver' },
  };
}

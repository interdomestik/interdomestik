import { git, isBootstrapAnchor } from './lean-current-authority-git.mjs';
import {
  CLOSEOUT,
  PROGRAM,
  TRACKER,
  parseAuthorityDocuments,
} from './lean-current-authority-policy.mjs';

const HISTORY_LIMIT = 128;

function projectionAt(repo, sha) {
  return parseAuthorityDocuments(
    git(repo, 'show', `${sha}:${PROGRAM}`),
    git(repo, 'show', `${sha}:${TRACKER}`)
  );
}

function projectionOrBootstrap(repo, sha) {
  try {
    return projectionAt(repo, sha);
  } catch (error) {
    if (isBootstrapAnchor(sha)) return null;
    throw error;
  }
}

export function authorityPathsTouched(repo, base, head) {
  if (base === head) return false;
  return (
    git(repo, 'log', '--first-parent', '--format=%H', `${base}..${head}`, '--', ...CLOSEOUT) !== ''
  );
}

export function locateAuthorityTransition(repo, anchor) {
  let current = anchor;
  for (let depth = 0; depth < HISTORY_LIMIT; depth += 1) {
    const projection = projectionOrBootstrap(repo, current);
    if (!projection) return { kind: 'bootstrap', bootstrapAnchor: current };
    if (projection.activeSlice) {
      return { kind: 'terminal', prior: projection, terminalProjectionSha: current };
    }
    const parent = git(repo, 'rev-parse', `${current}^1`);
    const parentProjection = projectionOrBootstrap(repo, parent);
    if (!parentProjection) {
      return { kind: 'bootstrap', bootstrapAnchor: parent, bootstrapMergeSha: current };
    }
    if (parentProjection.activeSlice) {
      return {
        kind: 'closeout_recorded',
        prior: parentProjection,
        terminalProjectionSha: parent,
        closeoutMergeSha: current,
      };
    }
    current = parent;
  }
  throw new Error('inactive authority history exceeds bounded first-parent search');
}

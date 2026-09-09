import { github, pullByBranch } from './lean-current-authority-git.mjs';

const MERGE = '7595d063493d397ec47d4376604b31b6bd7197ef';
const BASE = '3a5f6b28d2a0497a8bf4f798a2a3720c6163004a';
const HEAD = '18c1806e5db2180d6249bd4b7a63b727086b5619';
const BRANCH = 'codex/t117c-no-js-failure-closeout';

// One historical closeout used a branch outside the derived naming convention.
// This only locates its raw PR; ordinary closeout tree/scope/ancestry proof still runs.
export function historicalCloseoutPull(repo, transition, read = github) {
  if (transition.closeoutMergeSha !== MERGE) return null;
  const slice = transition.prior?.activeSlice;
  if (
    transition.terminalProjectionSha !== BASE ||
    slice?.sliceId !== 'T-117C' ||
    slice.expectedProductBranch !== 'codex/t117c-rendering-r4'
  )
    throw new Error('historical closeout transition mismatch');
  const pull = read('repos/interdomestik/interdomestik/pulls/1726', repo);
  if (
    pull?.number !== 1726 ||
    pull.state !== 'closed' ||
    pull.merged !== true ||
    pull.base?.sha !== BASE ||
    pull.head?.sha !== HEAD ||
    pull.head?.ref !== BRANCH ||
    pull.merge_commit_sha !== MERGE
  )
    throw new Error('historical closeout PR mismatch');
  return { branch: BRANCH, pull };
}

export function closeoutPull(repo, transition, read = github, byBranch = pullByBranch) {
  const historical = historicalCloseoutPull(repo, transition, read);
  if (historical) return historical;
  const branch = `${transition.prior.activeSlice.expectedProductBranch}-closeout`;
  return { branch, pull: byBranch(repo, branch, transition.closeoutMergeSha) };
}

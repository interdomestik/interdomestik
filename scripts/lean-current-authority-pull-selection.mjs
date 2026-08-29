import { SHA40 } from './lean-current-authority-policy.mjs';

function validCloseoutPull(pull, number) {
  return (
    pull?.number === number &&
    ['open', 'closed'].includes(pull.state) &&
    typeof pull.merged === 'boolean' &&
    SHA40.test(pull.base?.sha ?? '') &&
    typeof pull.head?.ref === 'string' &&
    SHA40.test(pull.head?.sha ?? '') &&
    Number.isInteger(pull.changed_files) &&
    pull.changed_files >= 0 &&
    !(pull.state === 'open' && pull.merged) &&
    (!pull.merged || SHA40.test(pull.merge_commit_sha ?? ''))
  );
}

function selectExactCloseoutPull(pulls, identity) {
  const heads = new Set(identity?.headShas ?? []);
  if (
    typeof identity?.branch !== 'string' ||
    !SHA40.test(identity.protectedMainSha ?? '') ||
    !SHA40.test(identity.protectedMainParentSha ?? '') ||
    heads.size === 0 ||
    [...heads].some(head => !SHA40.test(head))
  ) {
    throw new Error('closeout pull identity malformed');
  }
  const matches = pulls.filter(pull => {
    if (pull.head.ref !== identity.branch) return false;
    const currentHead = heads.has(pull.head.sha);
    const openMatch =
      pull.state === 'open' &&
      !pull.merged &&
      currentHead &&
      pull.base.sha === identity.protectedMainSha;
    const abandonedMatch =
      pull.state === 'closed' &&
      !pull.merged &&
      currentHead &&
      pull.base.sha === identity.protectedMainSha;
    const mergedMatch =
      pull.state === 'closed' &&
      pull.merged &&
      pull.base.sha === identity.protectedMainParentSha &&
      pull.merge_commit_sha === identity.protectedMainSha;
    return openMatch || abandonedMatch || mergedMatch;
  });
  if (matches.length !== 1) throw new Error('closeout pull identity ambiguous');
  return matches[0];
}

export function selectFullProductPull(summaries, readPull, closeoutIdentity) {
  if (!Array.isArray(summaries)) throw new Error('downstream PR inventory malformed');
  if (summaries.length === 0) {
    if (closeoutIdentity) throw new Error('closeout pull identity missing');
    return null;
  }
  if (summaries.length >= 10) throw new Error('downstream PR inventory incomplete');
  const numbers = summaries.map(summary => summary?.number);
  if (
    numbers.some(number => !Number.isInteger(number)) ||
    new Set(numbers).size !== numbers.length
  ) {
    throw new Error('downstream PR inventory malformed');
  }
  if (!closeoutIdentity) {
    if (numbers.length > 1) throw new Error('multiple downstream PRs found');
    return readPull(numbers[0]);
  }
  const pulls = numbers.map(number => readPull(number));
  if (pulls.some((pull, index) => !validCloseoutPull(pull, numbers[index]))) {
    throw new Error('downstream PR inventory malformed');
  }
  return selectExactCloseoutPull(pulls, closeoutIdentity);
}

export function closeoutPullIdentity(repo, branch, protectedMainSha, readGit) {
  const headShas = [readGit(repo, 'rev-parse', 'HEAD')];
  try {
    headShas.push(readGit(repo, 'rev-parse', '--verify', `refs/remotes/origin/${branch}`));
  } catch {
    // The checked-out canonical closeout head remains sufficient after branch deletion.
  }
  return {
    branch,
    protectedMainSha,
    protectedMainParentSha: readGit(repo, 'rev-parse', `${protectedMainSha}^`),
    headShas,
  };
}

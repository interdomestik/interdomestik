import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { sha256Hex } from '../verify-machine-marker.mjs';
import { gitState } from '../verify-machine-probe.mjs';
import { readBytes } from './bytes.mjs';

export const TICKET_CLASS = 'interdomestik.m4-gate-ticket/1';
export const MAX_TICKET_AGE_MS = 2 * 60 * 60 * 1000;
const GIT_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REPO = /^[\w.-]+\/[\w.-]+$/u;
const SUBJECT = /^(?:pr:[1-9]\d*|train:[a-zA-Z0-9][\w.-]{0,79})$/u;

export const isSha256 = value => typeof value === 'string' && SHA256.test(value);
export const isRunId = value => typeof value === 'string' && UUID.test(value);
const isCommit = value => typeof value === 'string' && GIT_SHA.test(value);
export const same = isDeepStrictEqual;

export function assertEvidence(condition, code) {
  if (!condition) throw new Error(code);
}

export function checkAuthority(identity) {
  const { repo, subject, attempt, head, tree, main, merge, reviewSha256, configurationSha256 } =
    identity ?? {};
  assertEvidence(
    typeof repo === 'string' && REPO.test(repo) &&
      typeof subject === 'string' && SUBJECT.test(subject) && isRunId(attempt),
    'attempt-identity'
  );
  assertEvidence(
    [head, tree, main, merge?.commit, merge?.tree].every(isCommit) &&
      same(merge.parents, [main, head]) && merge.tree === tree,
    'git-identity'
  );
  assertEvidence(isSha256(reviewSha256) && isSha256(configurationSha256), 'authority-digests');
  return {
    repo, subject, attempt, head, tree, main,
    merge: { commit: merge.commit, parents: merge.parents, tree: merge.tree },
    reviewSha256, configurationSha256,
  };
}

export function checkLiveAuthority(snapshot, { repo, subject, attempt }) {
  assertEvidence(snapshot?.state === 'eligible', 'attempt-ineligible');
  const current = checkAuthority(snapshot.identity);
  assertEvidence(current.repo === repo && current.subject === subject && current.attempt === attempt,
    'attempt-mismatch');
  return current;
}

export function checkQueueJob(job) {
  const { repo, subject, attempt, ticketId } = job ?? {};
  assertEvidence(typeof repo === 'string' && REPO.test(repo) &&
    typeof subject === 'string' && SUBJECT.test(subject) && isRunId(attempt) && isRunId(ticketId),
  'queued-job');
  return { repo, subject, attempt, ticketId };
}

export function checkQueuedTicket(ticket, job) {
  const expected = checkQueueJob(job);
  const { repo, subject, attempt } = ticket?.identity ?? {};
  assertEvidence(same(expected, { repo, subject, attempt, ticketId: ticket?.id }), 'queued-ticket');
}

export function issueTicket(identity, approved, lockfileSha256, now) {
  return {
    class: TICKET_CLASS,
    id: randomUUID(),
    issuedAt: now,
    expiresAt: now + MAX_TICKET_AGE_MS,
    policySha256: approved.sha256,
    lockfileSha256,
    identity: checkAuthority(identity),
  };
}

export function checkTicket(ticket, approved, now, current) {
  assertEvidence(ticket?.class === TICKET_CLASS && isRunId(ticket.id), 'ticket-class');
  assertEvidence(
    Number.isSafeInteger(ticket.issuedAt) && Number.isSafeInteger(ticket.expiresAt) &&
      ticket.issuedAt <= now && now < ticket.expiresAt &&
      ticket.expiresAt - ticket.issuedAt <= MAX_TICKET_AGE_MS,
    'ticket-expired'
  );
  assertEvidence(
    isSha256(ticket.lockfileSha256) && ticket.policySha256 === approved.sha256,
    'ticket-policy'
  );
  assertEvidence(same(checkAuthority(ticket.identity), ticket.identity), 'authority-fields');
  if (current !== undefined) {
    assertEvidence(same(checkAuthority(current), ticket.identity), 'ticket-stale');
  }
}

const gitEnv = {
  PATH: '/usr/bin:/bin',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_OPTIONAL_LOCKS: '0',
};

function git(root, args) {
  return execFileSync('/usr/bin/git', ['-c', 'core.fsmonitor=false', '-c', 'core.trustctime=true',
    '-c', 'core.ignoreStat=false', ...args], {
    cwd: root,
    env: gitEnv,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function checkGitInputs(root, identity, requireClean) {
  const exec = (_command, args, cwd) => git(cwd, args).toString().trim();
  const { head, tree, main, merge } = identity;
  const checkout = gitState(root, exec);
  assertEvidence(
    checkout.head === head && exec('git', ['rev-parse', 'HEAD^{tree}'], root) === tree &&
      exec('git', ['rev-parse', 'refs/remotes/origin/main^{commit}'], root) === main &&
      exec('git', ['show', '-s', '--format=%T %P', merge.commit], root) ===
        [merge.tree, ...merge.parents].join(' '),
    'git-drift'
  );
  assertEvidence(checkout.hiddenFromStatus === 0, 'hidden-index');
  assertEvidence(checkout.trackedClean && (!requireClean || checkout.clean), 'checkout-dirty');
  const committed = sha256Hex(git(root, ['cat-file', 'blob', `${head}:pnpm-lock.yaml`]));
  const actual = sha256Hex(readBytes(path.join(root, 'pnpm-lock.yaml')));
  assertEvidence(actual === committed, 'lockfile-drift');
  return { head, tree, main, lockfileSha256: actual };
}

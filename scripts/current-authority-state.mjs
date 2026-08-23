#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_ORIGIN,
  deriveAuthorityContext,
  normalizeOrigin,
} from './current-authority-state-lib.mjs';

const SHA40 = /^[a-f0-9]{40}$/u;
const must = (value, message) => {
  if (!value) throw new Error(message);
};
const sameKeys = (value, keys) => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
};

function exactRuntimeIdentity(live) {
  must(live && typeof live === 'object' && !Array.isArray(live), 'live identity unavailable');
  must(
    sameKeys(
      live,
      'operationSha256,childId,disposition,pullRequestNumber,pullRequestState,terminalFailure,origin,base,head,testedMerge,protectedMain,writerMapSha256,worktree,mcp'.split(
        ','
      )
    ),
    'live identity keys mismatch'
  );
  must(sameKeys(live.worktree, ['root', 'commonDir', 'head']), 'worktree identity keys mismatch');
  must(
    sameKeys(
      live.mcp,
      'sourceRoot,sourceHead,sourceCommonDir,targetRoot,targetHead,targetCommonDir,repoRoot'.split(
        ','
      )
    ),
    'MCP identity keys mismatch'
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
  must(
    live.mcp.sourceRoot !== live.mcp.targetRoot && SHA40.test(live.mcp.sourceHead),
    'MCP source identity mismatch'
  );
  must(
    live.mcp.targetRoot === live.worktree.root &&
      live.mcp.targetHead === live.head &&
      live.mcp.repoRoot === live.worktree.root,
    'MCP target identity mismatch'
  );
  must(
    live.mcp.sourceCommonDir === live.worktree.commonDir &&
      live.mcp.targetCommonDir === live.worktree.commonDir,
    'Git common directory mismatch'
  );
}

const failed = (reason, successorsBlocked = true) => ({
  runtimeAuthorized: false,
  activeSlice: null,
  successorsBlocked,
  reason,
});

export function resolveCurrentAuthority(source) {
  try {
    const context = deriveAuthorityContext(source);
    const { durable, live } = source;
    if (!durable.runtimeAuthorized)
      return failed('authority_not_active', durable.successorsBlocked);
    exactRuntimeIdentity(live);
    must(live.operationSha256 === context.operationSha256, 'stale live operation');
    must(
      live.childId === context.childId && live.disposition === context.liveDispositionRequired,
      'inactive live authority'
    );
    if (live.terminalFailure) return failed('terminal_failure');
    if (['MERGED', 'CLOSED'].includes(live.pullRequestState)) {
      return failed('authority_consumed_by_merge', false);
    }
    must(live.pullRequestState === 'OPEN', 'unknown pull request state');
    must(normalizeOrigin(live.origin) === CANONICAL_ORIGIN, 'origin mismatch');
    must(live.base === context.base && live.protectedMain === context.base, 'base/main mismatch');
    must(SHA40.test(live.head) && SHA40.test(live.testedMerge), 'head/tested merge mismatch');
    must(live.writerMapSha256 === context.writerMapSha256, 'live writer map mismatch');
    return { ...durable, ...context, activeSlice: context.childId };
  } catch {
    return failed('invalid_authority_projection');
  }
}

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv
    .slice(2)
    .find(item => item.startsWith(prefix))
    ?.slice(prefix.length);
  if (!value) throw new Error(`missing ${prefix}<path>`);
  return value;
}

function bytes(path) {
  return readFileSync(path);
}

function json(path) {
  return JSON.parse(bytes(path).toString('utf8'));
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function history(path) {
  return readdirSync(path)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const target = realpathSync(join(path, name));
      must(!relative(path, target).startsWith('..'), 'durable receipt path mismatch');
      return { name, value: json(target) };
    })
    .sort((left, right) => left.value.revision - right.value.revision);
}

export function readDurableAuthority(envelope, { durablePath, historyPath }) {
  const policy = envelope?.approvalEnvelope?.durableAuthority;
  must(isAbsolute(policy?.root) && typeof policy.state === 'string', 'durable root missing');
  must(
    policy.receiptClass === 'receipts/<operation-sha256>.json' &&
      policy.evidenceClass === 'evidence/<child-id>-<evidence-sha256>.json',
    'durable class mismatch'
  );
  const root = realpathSync(policy.root);
  const durableFile = realpathSync(durablePath);
  const receiptDirectory = realpathSync(historyPath);
  must(durableFile === realpathSync(join(root, policy.state)), 'durable state path mismatch');
  must(receiptDirectory === realpathSync(join(root, 'receipts')), 'durable history path mismatch');
  const receipts = history(receiptDirectory);
  must(
    receipts.every(item => item.name === `${item.value.operationSha256}.json`),
    'durable receipt filename mismatch'
  );
  const records = receipts.map(item => item.value);
  const evidence = records.map(record => {
    const target = resolve(root, record.evidenceRef);
    must(!relative(root, target).startsWith('..'), 'durable evidence path mismatch');
    const canonicalTarget = realpathSync(target);
    must(!relative(root, canonicalTarget).startsWith('..'), 'durable evidence path mismatch');
    const raw = bytes(canonicalTarget);
    const expected = record.evidenceRef.match(/-([a-f0-9]{64})\.json$/u)?.[1];
    must(expected && digest(raw) === expected, 'durable evidence digest mismatch');
    const value = JSON.parse(raw.toString('utf8'));
    must(raw.equals(Buffer.from(`${JSON.stringify(value, null, 2)}\n`)), 'noncanonical evidence');
    return value;
  });
  return { durable: json(durableFile), history: records, evidence };
}

function main() {
  try {
    const envelopePath = argument('envelope');
    const receiptPath = argument('receipt');
    const envelope = json(envelopePath);
    const durableAuthority = readDurableAuthority(envelope, {
      durablePath: argument('durable'),
      historyPath: argument('history'),
    });
    const result = resolveCurrentAuthority({
      projection: json(argument('projection')),
      envelope,
      approvalReceipt: json(receiptPath),
      artifactHashes: {
        envelopeSha256: digest(bytes(envelopePath)),
        approvalReceiptSha256: digest(bytes(receiptPath)),
      },
      ...durableAuthority,
      live: json(argument('live')),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.runtimeAuthorized) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`current authority resolution failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();

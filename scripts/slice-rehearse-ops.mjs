import { execFileSync, spawnSync } from 'node:child_process';

import {
  exactKeys,
  must,
  normalizeArtifactPath,
  normalizeCommitSha,
  normalizeGitBranch,
  normalizePullRequestNumber,
} from './slice-rehearse-canonical.mjs';

const ENVELOPE = /^[A-Z0-9][A-Z0-9-]*-DELIVERY-[1-9][0-9]*$/u;
const LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const DEFINITIONS = {
  pr_create: [
    'approvalEnvelopeId',
    'baseBranch',
    'bodyFile',
    'branch',
    'expectedHeadSha',
    'operation',
    'title',
  ],
  label_add: ['approvalEnvelopeId', 'expectedHeadSha', 'label', 'operation', 'prNumber'],
  feedback_comment: ['approvalEnvelopeId', 'bodyFile', 'expectedHeadSha', 'operation', 'prNumber'],
  telemetry_record: ['eventPath', 'ledgerPath', 'operation'],
  telemetry_summarize: ['inputPath', 'operation'],
};

function writerAuthority(request) {
  must(ENVELOPE.test(request.approvalEnvelopeId ?? ''), 'delivery approval envelope is invalid');
  normalizeCommitSha(request.expectedHeadSha, 'expected head SHA');
}

export function buildSafeOperation(request) {
  must(request && typeof request === 'object', 'operation request is invalid');
  const keys = DEFINITIONS[request.operation];
  must(keys, 'operation is unsupported');
  exactKeys(request, keys, 'operation request');
  if (request.operation === 'telemetry_summarize') {
    return {
      binary: process.execPath,
      args: ['scripts/slice-telemetry-v2.mjs', '--input', normalizeArtifactPath(request.inputPath)],
      mutating: false,
    };
  }
  if (request.operation === 'telemetry_record') {
    return {
      binary: process.execPath,
      args: [
        'scripts/slice-telemetry-v2-record.mjs',
        '--event',
        normalizeArtifactPath(request.eventPath),
        '--ledger',
        normalizeArtifactPath(request.ledgerPath),
      ],
      mutating: false,
    };
  }
  writerAuthority(request);
  if (request.operation === 'pr_create') {
    const title = request.title?.trim();
    must(
      typeof title === 'string' && title.length > 0 && !/[\r\n]/u.test(title),
      'PR title is invalid'
    );
    return {
      binary: 'gh',
      args: [
        'pr',
        'create',
        '--head',
        normalizeGitBranch(request.branch),
        '--base',
        normalizeGitBranch(request.baseBranch),
        '--title',
        title,
        '--body-file',
        normalizeArtifactPath(request.bodyFile),
      ],
      mutating: true,
    };
  }
  const prNumber = String(normalizePullRequestNumber(request.prNumber));
  if (request.operation === 'label_add') {
    must(LABEL.test(request.label ?? ''), 'label is invalid');
    return {
      binary: 'gh',
      args: ['pr', 'edit', prNumber, '--add-label', request.label],
      mutating: true,
    };
  }
  return {
    binary: 'gh',
    args: ['pr', 'comment', prNumber, '--body-file', normalizeArtifactPath(request.bodyFile)],
    mutating: true,
  };
}

function defaultReadHead() {
  return execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function defaultReadPrHead(prNumber) {
  return execFileSync(
    'gh',
    ['pr', 'view', String(prNumber), '--json', 'headRefOid', '--jq', '.headRefOid'],
    {
      encoding: 'utf8',
    }
  ).trim();
}

export function runSafeOperation(
  request,
  {
    readHead = defaultReadHead,
    readPrHead = defaultReadPrHead,
    execute = (binary, args) =>
      spawnSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    reconcile = () => null,
  } = {}
) {
  const command = buildSafeOperation(request);
  if (command.mutating) {
    must(readHead() === request.expectedHeadSha, 'exact local head differs from approved head');
    if (request.prNumber !== undefined) {
      must(
        readPrHead(request.prNumber) === request.expectedHeadSha,
        'exact PR head differs from approved head'
      );
    }
  }
  const result = execute(command.binary, command.args);
  if (result.status === 0) return { status: 'succeeded', command };
  if (!command.mutating) return { status: 'failed', command };
  return {
    status: 'failed_reconciled',
    command,
    reconciliation: reconcile(request),
    error: typeof result.stderr === 'string' ? result.stderr.trim() : null,
  };
}

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MACHINE_ROLES, machineRole, sha256Hex } from '../verify-machine-marker.mjs';
import { parsePlatformUuid } from '../verify-machine-probe.mjs';
import { finalRecordPath, MODES, recordDirectory } from '../verify-machine-records.mjs';
import { readTrustedMarker } from '../verify-machine-trust.mjs';
import { readBytes } from './bytes.mjs';
import {
  checkJobDirectory, hostCommand, protectedFile, readApproval, sign, signedDocument, writeArtifact,
} from './host.mjs';
import { checkManifest, MANIFEST_SHA256 } from './manifest.mjs';
import { runnerDigest } from './m5.mjs';
import { checkReceipt } from './receipt.mjs';
import {
  assertEvidence, checkLiveAuthority, checkGitInputs, checkTicket, isRunId, issueTicket, same,
} from './ticket.mjs';

export const EVIDENCE_DIR_ENV = 'INTERDOMESTIK_M4_EVIDENCE_DIR';

function m4Approval() {
  const approval = readApproval();
  const marker = readTrustedMarker();
  assertEvidence(
    process.platform === 'darwin' && marker.status === 'trusted' &&
      machineRole(marker.marker) === MACHINE_ROLES.m4 && marker.sha256 === approval.m4MarkerSha256,
    'm4-marker'
  );
  return approval;
}

function authority(stage, approval, root, { repo, subject, attempt }) {
  const resolver = protectedFile('gate-m4-context', approval.m4ResolverSha256).file;
  const snapshot = JSON.parse(hostCommand(resolver, [stage, approval.mode, root, repo, subject, attempt]));
  return checkLiveAuthority(snapshot, { repo, subject, attempt });
}

function issue(root, repo, subject, attempt, output) {
  const approved = m4Approval();
  const uuid = parsePlatformUuid(hostCommand('/usr/sbin/ioreg', ['-rd1', '-c',
    'IOPlatformExpertDevice']).toString());
  const marker = readTrustedMarker();
  assertEvidence(uuid && marker.sha256 === approved.m4MarkerSha256 &&
    sha256Hex(uuid) === marker.marker.machine.hardware_uuid_sha256, 'm4-hardware');
  const current = authority('queue', approved, root, { repo, subject, attempt });
  checkManifest(root, { historical: approved.mode === 'trial' });
  const git = checkGitInputs(root, current, true);
  const now = Date.now();
  const ticket = issueTicket(current, approved, git.lockfileSha256, now);
  checkTicket(ticket, approved, now, current);
  const bytes = Buffer.from(JSON.stringify(ticket));
  const signature = sign(bytes, 'm4');
  mkdirSync(output, { mode: 0o700 });
  writeArtifact(output, 'ticket.sig', signature);
  writeArtifact(output, 'ticket.json', bytes);
}

// Used by the trusted collector and independently by begin and stamp in the composed chain.
export function verifyComposition(root, directory, stage, mode = 'gate') {
  const approved = m4Approval();
  assertEvidence(approved.mode === mode, 'approval-mode');
  checkManifest(root, { historical: mode === 'trial' });
  checkJobDirectory(directory);
  const { value: issued } = signedDocument(directory, 'ticket', 'm4', approved);
  checkTicket(issued, approved, Date.now());
  const verified = checkReceipt(directory, approved, Date.now(), issued.identity);
  const { ticket, receipt, receiptSha256 } = verified;
  assertEvidence(same(issued, ticket), 'ticket-replaced');
  const git = checkGitInputs(root, ticket.identity, stage === 'dispatch');
  assertEvidence(git.lockfileSha256 === ticket.lockfileSha256, 'lockfile-ticket');
  const current = authority(stage, approved, root, ticket.identity);
  checkTicket(ticket, m4Approval(), Date.now(), current);
  return {
    method: mode === 'trial' ? 'composed-trial' : 'composed',
    repo: current.repo, subject: current.subject,
    attempt: current.attempt, ticketId: ticket.id,
    head: current.head, base: current.main, tree: current.tree, testedMerge: current.merge,
    markerSha256: approved.m4MarkerSha256, m5RunId: receipt.runId, m5ReceiptSha256: receiptSha256,
    m5FinishedAt: receipt.finishedAt, expiresAt: ticket.expiresAt,
  };
}

export function verifyStampComposition(root, directory, stage) {
  return verifyComposition(root, directory, stage, m4Approval().mode);
}

export function checkRecordPair(pr, security, expected) {
  const prStart = Date.parse(pr?.startedAt);
  const prFinish = Date.parse(pr?.finishedAt);
  const secStart = Date.parse(security?.startedAt);
  const secFinish = Date.parse(security?.finishedAt);
  for (const [lane, record] of [['pr-verify', pr], ['security-guard', security]]) {
    assertEvidence(
      record?.lane === lane && record.mode === MODES.gate && record.machineRole === MACHINE_ROLES.m4 &&
        record.result === 'passed' && record.head === expected.head &&
        record.markerSha256 === expected.markerSha256 && isRunId(record.runId) &&
        same(record.composition, expected),
      'm4-record'
    );
  }
  assertEvidence(
    pr.runId !== security.runId && expected.m5FinishedAt <= prStart && prStart <= secStart &&
      secStart <= secFinish && secFinish <= prFinish && prFinish < expected.expiresAt,
    'm4-run-pair'
  );
}

function publish(root, evidence, prPath, securityPath, output) {
  const expected = verifyComposition(root, evidence, 'accept');
  const records = [prPath, securityPath].map(file => {
    const bytes = readBytes(file, 1024 * 1024);
    return { file, bytes, record: JSON.parse(bytes) };
  });
  checkRecordPair(...records.map(entry => entry.record), expected);
  const directory = recordDirectory({ platform: process.platform });
  mkdirSync(output, { mode: 0o700 });
  const index = records.map(({ file, bytes, record }) => {
    assertEvidence(file === finalRecordPath(directory, record), 'm4-record-path');
    const name = path.basename(file);
    writeArtifact(output, name, bytes);
    return { name, recordSha256: sha256Hex(bytes), runId: record.runId, lane: record.lane,
      mode: record.mode, markerSha256: record.markerSha256 };
  });
  assertEvidence(same(verifyComposition(root, evidence, 'accept'), expected), 'm4-publish-drift');
  writeArtifact(output, 'accepted.json', JSON.stringify({ ...expected, records: index }));
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'digests' && args.length === 0) {
      console.log(JSON.stringify({ manifestSha256: MANIFEST_SHA256, m5RunnerSha256: runnerDigest() }));
    } else if (command === 'issue' && args.length === 5) {
      issue(...args);
    } else if (command === 'verify' && args.length === 2) {
      verifyComposition(...args, 'dispatch');
    } else if (command === 'trial-verify' && args.length === 2) {
      verifyComposition(...args, 'dispatch', 'trial');
    } else if (command === 'publish' && args.length === 5) {
      publish(...args);
    } else {
      throw new Error('usage');
    }
  } catch {
    console.error('M4 composed evidence refused.');
    process.exitCode = 1;
  }
}

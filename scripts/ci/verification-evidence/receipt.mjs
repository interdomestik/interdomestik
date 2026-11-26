import path from 'node:path';
import {
  isSupportedBash, MACHINE_ROLES, REQUIRED_FORBIDDEN_PORTS, sha256Hex,
} from '../verify-machine-marker.mjs';
import { readBytes } from './bytes.mjs';
import { checkJobDirectory, signedDocument } from './host.mjs';
import { DELEGATED, MANIFEST_SHA256 } from './manifest.mjs';
import { assertEvidence, checkQueuedTicket, checkTicket, isRunId, isSha256, same } from './ticket.mjs';

export const RECEIPT_CLASS = 'interdomestik.m5-delegated-evidence/1';
export const INSTALL_LOG = 'install.log';
export const JOB_LOG = 'job.log';
export const PURITY_REPORT = 'i18n-purity.json';

export function checkPurity(bytes, startedAt, finishedAt) {
  const report = JSON.parse(bytes);
  const generated = Date.parse(report?.generatedAt);
  assertEvidence(
    report?.mode === 'check' && generated >= startedAt && generated <= finishedAt &&
      typeof report.baseLocale === 'string' && report.baseLocale.length > 0 &&
      Array.isArray(report.locales) && report.locales.length > 0 &&
      report.metrics?.regressionCount === 0 && same(report.regressions, []) &&
      Array.isArray(report.resolved),
    'i18n-purity-report'
  );
}

const text = value => typeof value === 'string' && value.trim().length > 0;
const absolute = value => typeof value === 'string' && /^\/[^\r\n\0:]+$/u.test(value);
const port = value => Number.isInteger(value) && value > 0 && value < 65536 &&
  !REQUIRED_FORBIDDEN_PORTS.includes(value);

function checkProbe(probe, ticket, approved) {
  const { head, tree, main } = ticket.identity;
  const { machine, os, node, pnpm, bash, toolPath, executables, container, appPort } = probe ?? {};
  assertEvidence(
    probe?.markerSha256 === approved.m5MarkerSha256 && probe.slot === 'A' &&
      same(probe.git, { head, tree, main, lockfileSha256: ticket.lockfileSha256 }) &&
      isSha256(machine?.hardware_uuid_sha256) && ['arm64', 'x64'].includes(machine.arch) &&
      text(os?.version) && text(os.build) &&
      typeof node === 'string' && /^v\d+\.\d+\.\d+$/u.test(node) &&
      typeof pnpm === 'string' && /^\d+\.\d+\.\d+$/u.test(pnpm) && typeof bash === 'string' &&
      /^\d+\.\d+\.\d+/u.test(bash) && isSupportedBash(bash) &&
      text(toolPath) && toolPath.split(':').every(absolute) &&
      ['node', 'pnpm', 'bash'].every(tool => absolute(executables?.[tool])) &&
      text(container?.context) && text(container.engine) && container.ready === true &&
      typeof container.socket === 'string' && /^unix:\/\/\/[^\r\n\0]+$/u.test(container.socket) &&
      isSha256(container.id) && typeof container.imageId === 'string' &&
      /^sha256:[0-9a-f]{64}$/u.test(container.imageId) &&
      typeof container.image === 'string' && /@sha256:[0-9a-f]{64}$/u.test(container.image) &&
      container.databaseHost === '127.0.0.1' && port(container.databasePort) &&
      port(appPort) && container.databasePort !== appPort,
    'm5-probe'
  );
}

function checkArtifact(directory, name, digest) {
  const bytes = readBytes(path.join(directory, name));
  assertEvidence(isSha256(digest) && sha256Hex(bytes) === digest, 'artifact-digest');
  return bytes;
}

function checkLanes(directory, receipt) {
  assertEvidence(Array.isArray(receipt.lanes) && receipt.lanes.length === DELEGATED.length, 'm5-lanes');
  let previous = receipt.startedAt;
  for (const [index, [, id, command, report]] of DELEGATED.entries()) {
    const lane = receipt.lanes[index];
    assertEvidence(
      lane?.id === id && lane.command === command && lane.exit === 0 &&
        Number.isSafeInteger(lane.startedAt) && Number.isSafeInteger(lane.finishedAt) &&
        lane.startedAt >= previous && lane.finishedAt >= lane.startedAt &&
        lane.finishedAt <= receipt.finishedAt,
      'm5-lane'
    );
    previous = lane.finishedAt;
    const transcript = `${id}.log`;
    assertEvidence(same(Object.keys(lane.reports ?? {}), report ?
      [transcript, PURITY_REPORT] : [transcript]), 'm5-reports');
    checkArtifact(directory, transcript, lane.reports[transcript]);
    if (report) {
      const bytes = checkArtifact(directory, PURITY_REPORT, lane.reports[PURITY_REPORT]);
      checkPurity(bytes, lane.startedAt, lane.finishedAt);
    }
  }
}

export function checkReceipt(directory, approved, now, current, verify, job) {
  checkJobDirectory(directory);
  const issued = signedDocument(directory, 'ticket', 'm4', approved, verify);
  const ticket = issued.value;
  if (job !== undefined) checkQueuedTicket(ticket, job);
  checkTicket(ticket, approved, now, current);
  const collected = signedDocument(directory, 'receipt', 'm5', approved, verify);
  const receipt = collected.value;
  assertEvidence(
    receipt?.class === RECEIPT_CLASS && receipt.machineRole === MACHINE_ROLES.m5 &&
      isRunId(receipt.runId) && receipt.exit === 0 && receipt.completed === true &&
      same(receipt.ticket, ticket) && receipt.ticketSha256 === sha256Hex(issued.bytes) &&
      receipt.manifestSha256 === MANIFEST_SHA256 && receipt.runnerSha256 === approved.m5RunnerSha256,
    'm5-receipt'
  );
  assertEvidence(
    Number.isSafeInteger(receipt.startedAt) && Number.isSafeInteger(receipt.finishedAt) &&
      receipt.startedAt >= ticket.issuedAt && receipt.finishedAt >= receipt.startedAt &&
      receipt.finishedAt < ticket.expiresAt && receipt.finishedAt <= now,
    'm5-timing'
  );
  checkProbe(receipt.start, ticket, approved);
  assertEvidence(same(receipt.start, receipt.finish), 'm5-probe-drift');
  checkLanes(directory, receipt);
  checkArtifact(directory, INSTALL_LOG, receipt.installLogSha256);
  checkArtifact(directory, JOB_LOG, receipt.logSha256);
  return { ticket, receipt, receiptSha256: sha256Hex(collected.bytes) };
}

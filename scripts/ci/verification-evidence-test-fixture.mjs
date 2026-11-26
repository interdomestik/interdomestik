import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DELEGATED, MANIFEST_SHA256 } from './verification-evidence/manifest.mjs';
import { checkReceipt, PURITY_REPORT, RECEIPT_CLASS } from './verification-evidence/receipt.mjs';
import { issueTicket } from './verification-evidence/ticket.mjs';
import { MACHINE_ROLES, sha256Hex } from './verify-machine-marker.mjs';

export const now = Date.parse('2026-11-26T10:12:00.000Z');
export const head = 'c'.repeat(40);
export const main = 'd'.repeat(40);
export const tree = 'e'.repeat(40);
export const lockfile = sha256Hex('fixture lockfile\n');
export const approved = {
  sha256: '1'.repeat(64), m4MarkerSha256: '2'.repeat(64),
  m5MarkerSha256: '3'.repeat(64), m5RunnerSha256: '4'.repeat(64),
};

export function authorityFixture() {
  return {
    repo: 'example/repo', subject: 'pr:2157', attempt: randomUUID(), head, tree, main,
    merge: { commit: 'f'.repeat(40), tree, parents: [main, head] },
    reviewSha256: '5'.repeat(64), configurationSha256: '6'.repeat(64),
  };
}

export function evidenceFixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'composed-evidence-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const keys = { m4: generateKeyPairSync('ed25519'), m5: generateKeyPairSync('ed25519') };
  const write = (name, bytes) => {
    writeFileSync(path.join(dir, name), bytes);
    return sha256Hex(bytes);
  };
  const signed = (name, bytes, role = name === 'ticket' ? 'm4' : 'm5') => {
    write(`${name}.sig`, sign(null, Buffer.from(bytes), keys[role].privateKey));
    return write(`${name}.json`, bytes);
  };
  const authenticate = (bytes, signature, role) =>
    assert.ok(verify(null, bytes, keys[role].publicKey, signature), 'signature mismatch');
  const current = authorityFixture();
  const ticket = issueTicket(current, approved, lockfile, now - 10000);
  const ticketSha256 = signed('ticket', JSON.stringify(ticket));
  const startedAt = now - 9000;
  const finishedAt = now - 1000;
  const start = {
    markerSha256: approved.m5MarkerSha256, slot: 'A',
    git: { head, tree, main, lockfileSha256: lockfile },
    machine: { hardware_uuid_sha256: '7'.repeat(64), arch: 'arm64' },
    os: { build: 'fixture-build', version: '99.1' },
    executables: { bash: '/fixture/bash' }, node: 'v24.99.0', pnpm: '10.99.0', bash: '5.2.1',
    container: { context: 'orbstack', engine: '99.1', socket: 'unix:///fixture.sock', ready: true,
      image: `postgres:16@sha256:${'a'.repeat(64)}`, databasePort: 55438, databaseHost: '127.0.0.1' },
    appPort: 3310,
  };
  const receipt = {
    class: RECEIPT_CLASS, machineRole: MACHINE_ROLES.m5, completed: true, exit: 0, runId: randomUUID(),
    ticket, ticketSha256, runnerSha256: approved.m5RunnerSha256, manifestSha256: MANIFEST_SHA256,
    startedAt, finishedAt, start, finish: structuredClone(start),
    installLogSha256: write('install.log', 'frozen install transcript\n'),
    logSha256: write('job.log', 'complete transcript\n'),
    lanes: DELEGATED.map(([, id, command, report], index) => {
      const transcript = `${id}.log`;
      const clock = startedAt + index;
      return {
        id, command, exit: 0, startedAt: clock, finishedAt: clock,
        reports: {
          [transcript]: write(transcript, `executed ${command}\n`),
          ...(report ? { [PURITY_REPORT]: write(PURITY_REPORT, JSON.stringify({
            generatedAt: new Date(clock).toISOString(), mode: 'check', baseLocale: 'en',
            locales: ['sq'], metrics: { regressionCount: 0 }, resolved: [], regressions: [],
          })) } : {}),
        },
      };
    }),
  };
  const save = () => signed('receipt', JSON.stringify(receipt));
  save();
  return { dir, current, receipt, write, signed, save,
    verify: (identity = current, at = now, policy = approved) =>
      checkReceipt(dir, policy, at, identity, authenticate),
  };
}

import fs from 'node:fs';
import path from 'node:path';
import { ADOPTION } from './db-access-adoption.mjs';
import { writeGuardReport } from './db-access-report.mjs';
import { evaluateGuard, evaluateGuardParallel } from './db-access-evaluator.mjs';

export function runGuardCli({ repoRoot, argv = [], adoption = ADOPTION }) {
  let reportPath = 'tmp/db-access-guard/report.json';
  let report;
  try {
    if (Object.keys(process.env).some(key => /^(DB_ACCESS_GUARD_|TENANT_GUARD_)/u.test(key)))
      throw new Error('incomplete: unsupported guard environment override');
    for (const arg of argv) {
      if (arg === '--help' || arg === '-h') {
        console.log('Usage: check-db-access-guard.mjs [--report=tmp/path.json]');
        return 0;
      }
      if (!arg.startsWith('--report=') || !arg.slice(9).startsWith('tmp/') || arg.includes('..')) {
        throw new Error(`incomplete: unsupported guard override ${arg}`);
      }
      reportPath = arg.slice(9);
    }
    report = evaluateGuard(repoRoot, adoption);
  } catch (error) {
    report = {
      status: 'incomplete',
      trustedCommit: adoption.commit,
      trustedTree: adoption.tree,
      incomplete: [{ reason: error instanceof Error ? error.message : String(error) }],
      failingNewEntries: [],
    };
  }
  const output = path.join(repoRoot, reportPath);
  let directory = repoRoot;
  for (const segment of reportPath.split('/').slice(0, -1)) {
    directory = path.join(directory, segment);
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink())
      throw new Error('incomplete: report path symlink');
  }
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())
    throw new Error('incomplete: report file symlink');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    report = writeGuardReport(output, report, adoption);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (report.status === 'pass')
    console.log(
      `DB access guard passed: ${report.scannedCount} operations; historical baseline ${report.baselineCount}.`
    );
  else {
    console.error(
      `DB access guard ${report.status}: sensitive new direct DB access or incomplete proof.`
    );
    for (const entry of report.failingNewEntries)
      console.log(`${entry.file}:${entry.line} ${entry.method} [${entry.tenantPosture}]`);
    for (const item of report.incomplete ?? []) console.error(`${item.file ?? ''} ${item.reason}`);
  }
  console.log(`Report: ${reportPath}`);
  return report.status === 'pass' ? 0 : 1;
}

export async function runGuardCliParallel({ repoRoot, argv = [], adoption = ADOPTION }) {
  let reportPath = 'tmp/db-access-guard/report.json';
  let report;
  try {
    if (Object.keys(process.env).some(key => /^(DB_ACCESS_GUARD_|TENANT_GUARD_)/u.test(key)))
      throw new Error('incomplete: unsupported guard environment override');
    for (const arg of argv) {
      if (arg === '--help' || arg === '-h') {
        console.log('Usage: check-db-access-guard.mjs [--report=tmp/path.json]');
        return 0;
      }
      if (!arg.startsWith('--report=') || !arg.slice(9).startsWith('tmp/') || arg.includes('..')) {
        throw new Error(`incomplete: unsupported guard override ${arg}`);
      }
      reportPath = arg.slice(9);
    }
    report = await evaluateGuardParallel(repoRoot, adoption);
  } catch (error) {
    report = {
      status: 'incomplete',
      trustedCommit: adoption.commit,
      trustedTree: adoption.tree,
      incomplete: [{ reason: error instanceof Error ? error.message : String(error) }],
      failingNewEntries: [],
    };
  }
  const output = path.join(repoRoot, reportPath);
  let directory = repoRoot;
  for (const segment of reportPath.split('/').slice(0, -1)) {
    directory = path.join(directory, segment);
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink())
      throw new Error('incomplete: report path symlink');
  }
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())
    throw new Error('incomplete: report file symlink');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    report = writeGuardReport(output, report, adoption);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  if (report.status === 'pass')
    console.log(
      `DB access guard passed: ${report.scannedCount} operations; historical baseline ${report.baselineCount}.`
    );
  else {
    console.error(
      `DB access guard ${report.status}: sensitive new direct DB access or incomplete proof.`
    );
    for (const entry of report.failingNewEntries)
      console.log(`${entry.file}:${entry.line} ${entry.method} [${entry.tenantPosture}]`);
    for (const item of report.incomplete ?? []) console.error(`${item.file ?? ''} ${item.reason}`);
  }
  console.log(`Report: ${reportPath}`);
  return report.status === 'pass' ? 0 : 1;
}

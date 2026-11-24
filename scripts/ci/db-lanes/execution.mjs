import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { run } from 'node:test';

export function spawnPnpm(args, options) {
  const { cwd, env } = options;
  // Resolve the installation selected by the caller, including the CI setup action's pnpm.
  const found = spawnSync('/bin/sh', ['-c', 'command -v pnpm'], { cwd, env, encoding: 'utf8' });
  if (found.status !== 0) return found;
  return spawnSync(resolve(cwd, found.stdout.trimEnd()), args, options);
}

export function readExecution(filename) {
  let source;
  try {
    source = readFileSync(filename, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Execution report is missing');
    throw error;
  }
  if (!source.trim()) throw new Error('Execution report is empty');
  let report;
  try {
    report = JSON.parse(source);
  } catch {
    throw new Error('Execution report has invalid JSON');
  }
  if (typeof report?.complete !== 'boolean' || !Array.isArray(report.files)) {
    throw new TypeError('Execution report has an invalid shape');
  }
  return report;
}

export function checkExecution(expected, report) {
  const errors = [];
  if (!expected.length) errors.push('empty selection');
  if (!report.complete) errors.push('incomplete test run');
  const pending = new Set(expected);
  const seen = new Set();
  for (const result of report.files) {
    const file = result?.file;
    if (seen.has(file)) errors.push(`duplicate result: ${file}`);
    else if (!pending.delete(file)) errors.push(`unexpected result: ${file}`);
    seen.add(file);
    if (!Number.isSafeInteger(result?.passed) || result.passed <= 0) {
      errors.push(`no passing cases: ${file}`);
    }
    for (const key of ['failed', 'skipped', 'todo', 'cancelled', 'retried']) {
      if (result?.[key] !== 0) errors.push(`${key} cases or invalid count: ${file}`);
    }
  }
  for (const file of pending) errors.push(`missing result: ${file}`);
  return errors;
}

export async function nodeExecution(root, selected, execArgv) {
  if (!selected.length) return { complete: false, files: [] };
  const files = [];
  let complete = false;
  for await (const { type, data } of run({
    files: selected.map(file => join(root, file)),
    concurrency: 1,
    execArgv,
  })) {
    if (type !== 'test:summary') continue;
    if (data.file) {
      const { passed, failed, skipped, todo, cancelled } = data.counts;
      files.push({
        file: relative(root, data.file),
        passed,
        failed,
        skipped,
        todo,
        cancelled,
        retried: 0,
      });
    } else {
      complete = data.success;
    }
  }
  return { complete, files };
}

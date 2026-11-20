// The changed-file report (WP-05 design §4.2, §4.3): baseline items of the files a change touches,
// and the undeclared-rebuild signals. Report lines only; they block nothing.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';

const GIT = '/usr/bin/git';

function git(repo, args) {
  const result = spawnSync(GIT, ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.status !== 0)
    throw new ScanError(
      `changed-path discovery failed: git ${args[0]}: ${String(result.stderr).trim()}`
    );
  return result.stdout;
}

const fileOfKey = key => key.split('|')[1] ?? '';

// file -> lines changed, for the change base..head. A replaced line is one deletion and one
// addition, so it counts once: the larger of the two (code-r2 optional).
function changedLines(repo, baseSha, headSha) {
  // NUL-delimited, so a path is a literal field, never quoted (r5 B7).
  const numstat = git(repo, ['diff', '--no-renames', '--numstat', '-z', baseSha, headSha]);
  const changed = new Map();
  for (const record of numstat.split('\0').filter(Boolean)) {
    // `<added>\t<deleted>\t<path>`: the path is everything after the second tab (r6 B3).
    const first = record.indexOf('\t');
    const second = record.indexOf('\t', first + 1);
    const [added, deleted] = [record.slice(0, first), record.slice(first + 1, second)];
    changed.set(record.slice(second + 1), Math.max(Number(added), Number(deleted)));
  }
  return changed;
}

// file -> the head baseline's items of that file, for the changed files only.
function baselinedByFile(head, changed) {
  const byFile = new Map();
  for (const check of Object.values(head?.checks ?? {}))
    for (const item of check.items ?? []) {
      const file = fileOfKey(item);
      if (changed.has(file)) byFile.set(file, [...(byFile.get(file) ?? []), item]);
    }
  return byFile;
}

const addsPageReady = diff =>
  diff
    .split('\n')
    .some(line => line.startsWith('+') && !line.startsWith('+++') && line.includes('page-ready'));

// The undeclared-rebuild signals of one changed file.
function rebuildSignals(repo, baseSha, headSha, root, file, changedCount) {
  const signals = [];
  const abs = path.join(root, file);
  const lines = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split('\n').length : 0;
  if (lines && changedCount > lines / 2)
    signals.push(
      `likely rebuild: ${file} changes more than half its lines; list it in rebuilt-screens.json or say why not`
    );
  if (addsPageReady(git(repo, ['diff', '-U0', baseSha, headSha, '--', file])))
    signals.push(`likely rebuild: ${file} adds a page-ready marker`);
  return signals;
}

// A signal as one printable line: it names a PR-controlled path, so its control characters are
// escaped as in JSON before it reaches the trusted run's log (r6 B1).
export const signalLine = signal =>
  String(signal).replaceAll(/[\u0000-\u001f\u007f]/gu, ch => JSON.stringify(ch).slice(1, -1));

// { baselined: { file: [items] }, signals: [text] } for the change base..head.
export function changeReport(repo, baseSha, headSha, root, head, rebuilt) {
  const changed = changedLines(repo, baseSha, headSha);
  const byFile = baselinedByFile(head, changed);
  const listed = new Set(rebuilt);
  const signals = [];
  for (const file of [...byFile.keys()].sort(byCodeUnit))
    if (!listed.has(file))
      signals.push(...rebuildSignals(repo, baseSha, headSha, root, file, changed.get(file)));
  const baselined = Object.fromEntries([...byFile].sort(([a], [b]) => byCodeUnit(a, b)));
  return { baselined, signals };
}

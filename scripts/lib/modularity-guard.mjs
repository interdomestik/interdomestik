import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FILE_CLASSES,
  MODULARITY_POLICY,
  classifyModularityFile,
  isModularityChecked,
  structuredArtifactOwner,
} from '../modularity-guard-policy.mjs';

const GIT_BIN = '/usr/bin/git';
const GIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const SAFE_EXEC_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
const TOOL_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const prettierCli = () =>
  fs.realpathSync(path.join(TOOL_ROOT, 'node_modules/prettier/bin/prettier.cjs'));
const PRETTIER_CONFIG = path.join(TOOL_ROOT, '.prettierrc');

function git(root, args, options = {}) {
  return execFileSync(GIT_BIN, args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    env: { ...SAFE_EXEC_ENV, ...options.env },
    maxBuffer: options.maxBuffer ?? GIT_MAX_BUFFER_BYTES,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
}

function tryGit(root, args, options = {}) {
  try {
    return git(root, args, options);
  } catch {
    return null;
  }
}

function resolveCommit(root, ref) {
  const output = tryGit(root, ['rev-parse', '--verify', `${ref}^{commit}`]);
  return output?.trim() || null;
}

export function resolveModularityBaseRef(root, env = process.env) {
  const candidates = [
    env.MODULARITY_GUARD_BASE_SHA,
    env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : null,
    'origin/main',
    'main',
    'HEAD~1',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const commit = resolveCommit(root, candidate);
    if (commit) return { ref: candidate, commit };
  }
  return null;
}

export function parseNameStatus(output) {
  const tokens = output.toString('utf8').split('\0').filter(Boolean);
  const entries = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!status) continue;
    if (status.startsWith('R') || status.startsWith('C')) {
      const oldPath = tokens[index++];
      const file = tokens[index++];
      entries.push({ file, oldPath, status: status[0] });
      continue;
    }
    entries.push({ file: tokens[index++], oldPath: null, status: status[0] });
  }
  return entries;
}

function changedFiles(root, baseCommit) {
  const output = git(root, [
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    '--diff-filter=ACMR',
    baseCommit,
    '--',
  ]);
  return [...parseNameStatus(output), ...untrackedFiles(root)];
}

function untrackedFiles(root) {
  const output = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  return output
    .split('\0')
    .filter(Boolean)
    .map(file => ({ file, oldPath: null, status: 'A' }));
}

export function lineCount(text) {
  if (text.length === 0) return 0;
  const newlineCount = text.match(/\n/gu)?.length ?? 0;
  return text.endsWith('\n') ? newlineCount : newlineCount + 1;
}

function snapshot(text) {
  return {
    text,
    lines: lineCount(text),
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}

function currentSnapshot(root, filePath) {
  return snapshot(fs.readFileSync(path.join(root, filePath), 'utf8'));
}

function baseSnapshot(root, baseCommit, filePath) {
  const output = tryGit(root, ['show', `${baseCommit}:${filePath}`]);
  return output == null ? null : snapshot(output);
}

function workflowComplexity(text) {
  return text.match(/^[ \t]*(?:-[ \t]*)?(?:if|needs|permissions|run|uses):/gmu)?.length ?? 0;
}

function canonicalJson(_root, filePath, text) {
  try {
    JSON.parse(text);
    const formatted = execFileSync(
      process.execPath,
      [prettierCli(), '--config', PRETTIER_CONFIG, '--stdin-filepath', filePath],
      {
        cwd: TOOL_ROOT,
        encoding: 'utf8',
        env: SAFE_EXEC_ENV,
        input: text,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
      }
    );
    return text === formatted;
  } catch {
    return false;
  }
}

function removedGovernanceHeading(current, base) {
  const headings = text => new Set(text.match(/^#{1,6}[ \t]+[^\r\n]+$/gmu) ?? []);
  const currentHeadings = headings(current.text);
  if (!base) return currentHeadings.size === 0;
  return [...headings(base.text)].some(heading => !currentHeadings.has(heading));
}

function finding(entry, className, current, base, reason) {
  return {
    ...entry,
    className,
    baseLines: base?.lines ?? null,
    currentLines: current.lines,
    baseBytes: base?.bytes ?? null,
    currentBytes: current.bytes,
    reason,
  };
}

function evaluateProduction(entry, className, current, base) {
  const { preferredLines, reviewLines } = MODULARITY_POLICY.productionCode;
  if (current.lines <= preferredLines) return {};
  if (current.lines <= reviewLines) {
    return {
      advisory: finding(entry, className, current, base, 'production-modularity-checkpoint'),
    };
  }
  if (base?.lines > reviewLines && current.lines <= base.lines) {
    return {
      advisory: finding(entry, className, current, base, 'legacy-production-stable'),
    };
  }
  return {
    violation: finding(entry, className, current, base, 'production-review-required'),
  };
}

function evaluateFocused(_root, entry, className, current, base) {
  const reason =
    current.lines > MODULARITY_POLICY.focusedTest.maxLines ? 'test-split-required' : null;
  return { className, violation: reason ? finding(entry, className, current, base, reason) : null };
}

function evaluateStructured(root, entry, className, current, base) {
  let reason = structuredArtifactOwner(entry.file) ? null : 'structured-owner-required';
  if (current.bytes > MODULARITY_POLICY.structuredArtifact.maxBytes) {
    reason = 'structured-byte-budget';
  } else if (entry.file.endsWith('.json') && !canonicalJson(root, entry.file, current.text)) {
    reason = 'structured-noncanonical-json';
  }
  return { className, violation: reason ? finding(entry, className, current, base, reason) : null };
}

function evaluateGovernance(_root, entry, className, current, base) {
  const policy = MODULARITY_POLICY.governanceDoc;
  let reason =
    current.lines > policy.maxLines || current.bytes > policy.maxBytes ? 'governance-budget' : null;
  if (!reason && removedGovernanceHeading(current, base)) reason = 'governance-invariant-removal';
  return { className, violation: reason ? finding(entry, className, current, base, reason) : null };
}

function evaluateWorkflow(_root, entry, className, current, base) {
  const grew = base && workflowComplexity(current.text) > workflowComplexity(base.text);
  const violation = grew
    ? finding(entry, className, current, base, 'workflow-complexity-growth')
    : null;
  const advisory = base
    ? null
    : finding(entry, className, current, base, 'new-workflow-contract-required');
  return { className, violation, advisory };
}

const ENTRY_EVALUATORS = {
  [FILE_CLASSES.productionCode]: (_root, entry, className, current, base) => ({
    className,
    ...evaluateProduction(entry, className, current, base),
  }),
  [FILE_CLASSES.focusedTest]: evaluateFocused,
  [FILE_CLASSES.structuredArtifact]: evaluateStructured,
  [FILE_CLASSES.governanceDoc]: evaluateGovernance,
  [FILE_CLASSES.workflowYaml]: evaluateWorkflow,
  [FILE_CLASSES.generatedOrLock]: (_root, _entry, className) => ({ className }),
};

function evaluateEntry(root, baseCommit, entry) {
  if (!entry.file || !isModularityChecked(entry.file)) return null;
  const className = classifyModularityFile(entry.file);
  const current = currentSnapshot(root, entry.file);
  const basePath = entry.oldPath ?? entry.file;
  const base = ['A', 'C'].includes(entry.status) ? null : baseSnapshot(root, baseCommit, basePath);
  const evaluate = ENTRY_EVALUATORS[className];
  return evaluate
    ? evaluate(root, entry, className, current, base)
    : { className, violation: finding(entry, className, current, base, 'unclassified-text') };
}

export function evaluateModularityGuard(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const base = options.baseRef
    ? { ref: options.baseRef, commit: resolveCommit(root, options.baseRef) }
    : resolveModularityBaseRef(root, options.env ?? process.env);
  if (!base?.commit) {
    return {
      base: null,
      status: 'skipped',
      violations: [],
      advisories: [],
      warning: 'Modularity guard skipped: no base ref resolved.',
    };
  }
  const entries = changedFiles(root, base.commit);
  const evaluated = entries.map(entry => evaluateEntry(root, base.commit, entry)).filter(Boolean);
  return {
    base,
    checkedFiles: evaluated.length,
    classCounts: Object.fromEntries(
      Object.values(FILE_CLASSES).map(className => [
        className,
        evaluated.filter(item => item.className === className).length,
      ])
    ),
    status: 'checked',
    violations: evaluated.map(item => item.violation).filter(Boolean),
    advisories: evaluated.map(item => item.advisory).filter(Boolean),
  };
}

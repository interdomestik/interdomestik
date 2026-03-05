#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const ALLOWED_ROLES = new Set(['canonical_plan', 'tracker', 'execution_log', 'input']);
const ALLOWED_STATUSES = new Set(['active', 'superseded', 'archived', 'draft']);
const CANONICAL_PLAN_PATH = 'docs/plans/current-program.md';
const CANONICAL_TRACKER_PATH = 'docs/plans/current-tracker.md';
const LIVE_MARKERS = [/^Current phase:/im, /^## Next Up\b/im, /^## Top 12 Next Actions\b/im];
const LOCAL_TASK_PATH = '.agent/tasks/current_task.md';

function parseArgs(argv) {
  const args = [...argv];
  let root = process.cwd();

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === '--root') {
      const value = args.shift();

      if (!value) {
        throw new Error('missing value for --root');
      }

      root = path.resolve(value);
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return { root };
}

function normalizeValue(rawValue) {
  const value = rawValue.trim();

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return null;
  }

  const metadata = {};

  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1);
    metadata[key] = normalizeValue(rawValue);
  }

  return {
    metadata,
    body: content.slice(match[0].length),
  };
}

function toRepoPath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function hasStatusBanner(body) {
  const firstLines = body.split(/\r?\n/).slice(0, 12).join('\n');
  return /> Status:/m.test(firstLines);
}

function loadGovernedDocs(root) {
  const files = globSync('docs/**/*.md', {
    cwd: root,
    absolute: true,
    nodir: true,
  });

  const docs = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const frontMatter = parseFrontMatter(content);

    if (!frontMatter?.metadata?.plan_role) {
      continue;
    }

    docs.push({
      path: toRepoPath(root, file),
      absolutePath: file,
      content,
      body: frontMatter.body,
      meta: frontMatter.metadata,
    });
  }

  return docs;
}

function ensureReferencedPathExists(root, target) {
  if (typeof target !== 'string' || target.trim() === '') {
    return false;
  }

  return fs.existsSync(path.resolve(root, target));
}

function validateDocs(root, docs) {
  const errors = [];

  if (docs.length === 0) {
    errors.push('no governed planning documents found');
    return errors;
  }

  for (const doc of docs) {
    const { meta, body, path: docPath } = doc;

    if (!ALLOWED_ROLES.has(meta.plan_role)) {
      errors.push(`${docPath}: invalid plan_role '${String(meta.plan_role)}'`);
    }

    if (!ALLOWED_STATUSES.has(meta.status)) {
      errors.push(`${docPath}: invalid status '${String(meta.status)}'`);
    }

    if (typeof meta.source_of_truth !== 'boolean') {
      errors.push(`${docPath}: source_of_truth must be true or false`);
    }

    if (typeof meta.owner !== 'string' || meta.owner.trim() === '') {
      errors.push(`${docPath}: owner is required`);
    }

    if (typeof meta.last_reviewed !== 'string' || meta.last_reviewed.trim() === '') {
      errors.push(`${docPath}: last_reviewed is required`);
    }

    if (meta.status === 'superseded') {
      if (!ensureReferencedPathExists(root, meta.superseded_by)) {
        errors.push(`${docPath}: superseded documents must declare a valid superseded_by path`);
      }
    }

    if (meta.source_of_truth === true) {
      if (meta.status !== 'active') {
        errors.push(`${docPath}: source_of_truth documents must be active`);
      }

      if (!['canonical_plan', 'tracker', 'execution_log'].includes(meta.plan_role)) {
        errors.push(
          `${docPath}: only canonical_plan, tracker, or execution_log may be source_of_truth`
        );
      }
    } else if (!hasStatusBanner(body)) {
      errors.push(
        `${docPath}: non-authoritative planning docs must show a visible '> Status:' banner`
      );
    }

    if (meta.plan_role === 'input' && meta.status === 'active') {
      for (const marker of LIVE_MARKERS) {
        if (marker.test(body)) {
          errors.push(`${docPath}: active input docs may not present live execution markers`);
        }
      }
    }
  }

  const activeCanonicalPlans = docs.filter(
    doc =>
      doc.meta.plan_role === 'canonical_plan' &&
      doc.meta.status === 'active' &&
      doc.meta.source_of_truth === true
  );
  const activeTrackers = docs.filter(
    doc =>
      doc.meta.plan_role === 'tracker' &&
      doc.meta.status === 'active' &&
      doc.meta.source_of_truth === true
  );
  const activeExecutionLogs = docs.filter(
    doc =>
      doc.meta.plan_role === 'execution_log' &&
      doc.meta.status === 'active' &&
      doc.meta.source_of_truth === true
  );

  if (activeCanonicalPlans.length !== 1) {
    errors.push(
      `expected exactly 1 active canonical_plan source of truth, found ${activeCanonicalPlans.length}`
    );
  }

  if (activeTrackers.length !== 1) {
    errors.push(
      `expected exactly 1 active tracker source of truth, found ${activeTrackers.length}`
    );
  }

  if (activeExecutionLogs.length !== 1) {
    errors.push(
      `expected exactly 1 active execution_log source of truth, found ${activeExecutionLogs.length}`
    );
  }

  if (activeCanonicalPlans.length === 1 && activeCanonicalPlans[0].path !== CANONICAL_PLAN_PATH) {
    errors.push(
      `active canonical plan must live at ${CANONICAL_PLAN_PATH}, found ${activeCanonicalPlans[0].path}`
    );
  }

  if (activeTrackers.length === 1 && activeTrackers[0].path !== CANONICAL_TRACKER_PATH) {
    errors.push(
      `active tracker must live at ${CANONICAL_TRACKER_PATH}, found ${activeTrackers[0].path}`
    );
  }

  return errors;
}

function validateLocalTaskFile(root) {
  const taskPath = path.resolve(root, LOCAL_TASK_PATH);

  if (!fs.existsSync(taskPath)) {
    return [];
  }

  const content = fs.readFileSync(taskPath, 'utf8');
  const errors = [];

  if (!/status:\s*'superseded'|status:\s*superseded/m.test(content)) {
    errors.push(`${LOCAL_TASK_PATH}: local task file must declare status: superseded`);
  }

  if (
    !/superseded_by:\s*'docs\/plans\/current-tracker\.md'|superseded_by:\s*docs\/plans\/current-tracker\.md/m.test(
      content
    )
  ) {
    errors.push(`${LOCAL_TASK_PATH}: local task file must point to docs/plans/current-tracker.md`);
  }

  if (!/Use `pnpm plan:status`/m.test(content)) {
    errors.push(`${LOCAL_TASK_PATH}: local task file must point readers to pnpm plan:status`);
  }

  return errors;
}

function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const docs = loadGovernedDocs(root);
  const errors = [...validateDocs(root, docs), ...validateLocalTaskFile(root)];

  if (errors.length > 0) {
    console.error('plan:audit failed');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const summary = {
    governed_docs: docs.length,
    canonical_plan: CANONICAL_PLAN_PATH,
    tracker: CANONICAL_TRACKER_PATH,
    execution_logs: docs.filter(
      doc =>
        doc.meta.plan_role === 'execution_log' &&
        doc.meta.status === 'active' &&
        doc.meta.source_of_truth === true
    ).length,
  };

  console.log('plan:audit passed');
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`plan:audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { rootDir } from './db-access-required-git.mjs';

export const REPO = 'interdomestik/interdomestik';
export const CHECKOUT = 'actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8';
export const workflowText = fs.readFileSync(
  path.join(rootDir, '.github/workflows/tenant-guard-required.yml'),
  'utf8'
);
export const workflow = yaml.load(workflowText);
export const job = workflow.jobs['tenant-guard'];
export const guardStep = job.steps.find(step => step.id === 'protected_db_access');
// The harness executes the production text verbatim. The authenticated archive seam bypasses the
// timeout/curl branch; the bootstrap tar flags are accepted by GNU tar (Linux) and bsdtar (macOS).
export const localScript = guardStep.run;

// Exact embedded production fragment [start, end), for unit contracts the immutable source cannot host.
export function embedded(start, end) {
  const run = guardStep.run;
  const from = run.indexOf(start);
  const to = run.indexOf(end, from + start.length);
  if (from < 0 || to < 0 || run.includes(start, from + 1))
    throw new Error(`embedded fragment ${start} is missing or ambiguous`);
  return run.slice(from, to);
}

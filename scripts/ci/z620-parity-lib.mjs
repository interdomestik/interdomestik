import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const excludedModes = new Set(['provider', 'release-only']);

export function workflowDigest(root, workflowPath) {
  return createHash('sha256')
    .update(fs.readFileSync(path.join(root, workflowPath)))
    .digest('hex');
}

export function validateWorkflowDigests(root, parity) {
  const problems = [];
  const workflows = Object.keys(parity.workflows ?? {}).sort();
  const digestPaths = Object.keys(parity.workflowDigests ?? {}).sort();
  if (JSON.stringify(workflows) !== JSON.stringify(digestPaths)) {
    problems.push('Workflow digest inventory does not match parity inventory');
    return problems;
  }
  for (const workflowPath of workflows) {
    if (workflowDigest(root, workflowPath) !== parity.workflowDigests[workflowPath]) {
      problems.push(`${workflowPath}: workflow changed without parity digest update`);
    }
  }
  return problems;
}

export function requiredJobKeys(parity) {
  const keys = [];
  for (const [workflowPath, jobs] of Object.entries(parity.workflows ?? {})) {
    for (const [job, definition] of Object.entries(jobs)) {
      if (!excludedModes.has(definition[0])) keys.push(`${workflowPath}#${job}`);
    }
  }
  return keys.sort();
}

export function validateGateCoverage(parity, gates) {
  const required = requiredJobKeys(parity);
  const covered = Object.keys(gates.jobCoverage ?? {}).sort();
  const problems = [];
  for (const key of required) {
    if (!covered.includes(key)) problems.push(`${key}: missing local gate coverage`);
  }
  for (const key of covered) {
    if (!required.includes(key)) problems.push(`${key}: unknown or excluded job coverage`);
    for (const lane of gates.jobCoverage[key] ?? []) {
      if (!gates.lanes?.[lane]) problems.push(`${key}: unknown lane ${lane}`);
    }
  }
  for (const [lane, definition] of Object.entries(gates.lanes ?? {})) {
    if (!Array.isArray(definition.commands) || definition.commands.length === 0) {
      problems.push(`${lane}: lane has no commands`);
    }
  }
  return problems;
}

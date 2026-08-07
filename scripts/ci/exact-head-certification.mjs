#!/usr/bin/env node

import { evaluateExactHeadCertification } from './exact-head-certification-lib.mjs';
import { readTrustedRunnerFile } from './trusted-runner-file.mjs';

const policy = process.env.POLICY_JSON ? JSON.parse(process.env.POLICY_JSON) : {};

function policyBoolean(name, key) {
  const value = policy[key] ?? process.env[name];
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new TypeError(`${name} must be true or false`);
}

function positiveInteger(name) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

const event = JSON.parse(readTrustedRunnerFile(process.env.GITHUB_EVENT_PATH));
const pullRequest = event.pull_request;
const result = evaluateExactHeadCertification({
  eventName: process.env.GITHUB_EVENT_NAME || 'unknown',
  action: event.action || '',
  draft: pullRequest?.draft,
  labelName: event.label?.name || '',
  sameRepository:
    Boolean(pullRequest?.head?.repo?.full_name) &&
    pullRequest.head.repo.full_name === event.repository?.full_name,
  runAttempt: positiveInteger('GITHUB_RUN_ATTEMPT'),
  policyShouldRun: policyBoolean('POLICY_SHOULD_RUN', 'should_run'),
  policyRunFull: policyBoolean('POLICY_RUN_FULL', 'run_full'),
  policyForceFull: policyBoolean('POLICY_FORCE_FULL', 'force_full'),
  policyReason: policy.reason ?? process.env.POLICY_REASON ?? 'unknown',
});

process.stdout.write(`run_broad=${String(result.runBroad)}\n`);
process.stdout.write(`certification_required=${String(result.certificationRequired)}\n`);
process.stdout.write(`consume_full_gate=${String(result.consumeFullGate)}\n`);
process.stdout.write(`certification_reason=${result.reason}\n`);

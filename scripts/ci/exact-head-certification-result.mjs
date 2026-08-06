#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export function evaluateCertificationResult(input) {
  if (!Number.isInteger(input.runAttempt) || input.runAttempt < 1) {
    throw new TypeError('runAttempt must be a positive integer');
  }
  if (input.preflightResult !== 'success') {
    return { ok: false, message: 'PR E2E preflight failed.' };
  }
  if (input.runAttempt > 1 && !input.runBroad) {
    return {
      ok: false,
      message: 'A replayed lightweight E2E result cannot certify the current head.',
    };
  }
  if (input.certificationRequired) {
    return {
      ok: false,
      message: 'This exact head requires broad certification. Apply the full-gate label.',
    };
  }
  if (!input.runBroad) {
    return { ok: true, message: `PR E2E skipped (${input.reason}).` };
  }
  if (input.runnerResult !== 'success') {
    return {
      ok: false,
      message: `PR E2E runner did not complete successfully (${input.runnerResult}).`,
    };
  }
  return { ok: true, message: 'PR E2E broad certification passed.' };
}

function envBoolean(name) {
  if (process.env[name] === 'true') return true;
  if (process.env[name] === 'false') return false;
  throw new TypeError(`${name} must be true or false`);
}

function envPositiveInteger(name) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function runCli() {
  const result = evaluateCertificationResult({
    preflightResult: process.env.PREFLIGHT_RESULT || '',
    runBroad: envBoolean('RUN_BROAD'),
    certificationRequired: envBoolean('CERTIFICATION_REQUIRED'),
    runAttempt: envPositiveInteger('GITHUB_RUN_ATTEMPT'),
    runnerResult: process.env.RUNNER_RESULT || '',
    reason: process.env.CERTIFICATION_REASON || 'unknown',
  });
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${result.ok ? '' : '::error::'}${result.message}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli();
}

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CHARTER_MAP = path.join('scripts', 'plan-conformance', 'charter-map.json');
const DEFAULT_NO_TOUCH_MANIFEST = path.join('scripts', 'release-gate', 'v1-required-specs.json');

const VALID_DECISIONS = new Set(['continue', 'pause', 'rollback']);
const VALID_MODES = new Set(['advisory', 'enforced']);
const VALID_CHECK_STATUSES = new Set(['pass', 'fail', 'warn', 'skip']);

function readJson(jsonPath) {
  const absolutePath = path.resolve(jsonPath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function getNoTouchZones(manifestPath = DEFAULT_NO_TOUCH_MANIFEST) {
  const manifest = readJson(manifestPath);
  const zones = manifest?.no_touch_zones;
  return Array.isArray(zones) ? zones : [];
}

function escapeRegexChar(char) {
  if (/[\^$+?.()|{}[\]\\]/.test(char)) {
    return `\\${char}`;
  }
  return char;
}

function globToRegExp(pattern) {
  const normalized = String(pattern || '').split(path.sep).join('/');
  let out = '^';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '*' && next === '*') {
      out += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      out += '[^/]*';
      continue;
    }

    out += escapeRegexChar(char);
  }

  out += '$';
  return new RegExp(out);
}

function matchesPattern(filePath, pattern) {
  const normalizedPath = String(filePath || '').split(path.sep).join('/');
  return globToRegExp(String(pattern || '')).test(normalizedPath);
}

function matchesAnyPattern(filePath, patterns) {
  return patterns.some(pattern => matchesPattern(filePath, pattern));
}

function validateChecksShape(checks, errors) {
  if (!Array.isArray(checks)) {
    errors.push('checks must be an array');
    return;
  }

  for (const check of checks) {
    if (!check || typeof check !== 'object') {
      errors.push('checks must contain objects');
      continue;
    }

    if (!check.name || typeof check.name !== 'string') {
      errors.push('each check requires a string name');
    }

    if (!VALID_CHECK_STATUSES.has(check.status)) {
      errors.push(`unsupported check status for ${check.name || '<unknown>'}: ${check.status}`);
    }
  }
}

export function validateConformanceRecord(record, options = {}) {
  const errors = [];
  const warnings = [];

  const charterMap = options.charterMap || readJson(options.charterMapPath || DEFAULT_CHARTER_MAP);
  const noTouchZones = options.noTouchZones || getNoTouchZones(options.noTouchManifestPath);

  if (!record || typeof record !== 'object') {
    return { ok: false, errors: ['record must be an object'], warnings };
  }

  const stepId = String(record.step_id || '');
  const epicId = String(record.epic_id || '');
  const mode = String(record.mode || '');
  const decision = String(record.decision || '');

  if (!stepId) errors.push('step_id is required');
  if (!epicId) errors.push('epic_id is required');
  if (!mode) errors.push('mode is required');
  if (!decision) errors.push('decision is required');

  if (mode && !VALID_MODES.has(mode)) {
    errors.push(`unsupported mode: ${mode}`);
  }

  if (decision && !VALID_DECISIONS.has(decision)) {
    errors.push(`unsupported decision: ${decision}`);
  }

  if (!Array.isArray(record.files_changed)) {
    errors.push('files_changed must be an array');
  }

  validateChecksShape(record.checks, errors);

  const sprintScope = new Set(charterMap.sprint_scope || []);
  if (epicId && !sprintScope.has(epicId)) {
    errors.push(`epic_id ${epicId} is outside locked Sprint 1-2 scope`);
  }

  const advisoryOnlyEpics = new Set(charterMap.advisory_only_epics || []);
  if (advisoryOnlyEpics.has(epicId) && mode !== 'advisory') {
    errors.push(`${epicId} must remain advisory-only until promotion gate passes`);
  }

  const epicCatalog = charterMap?.step_catalog?.[epicId];
  if (!epicCatalog) {
    errors.push(`missing step catalog for epic_id ${epicId}`);
  } else {
    const knownSteps = new Set(Object.keys(epicCatalog.steps || {}));
    if (!knownSteps.has(stepId)) {
      errors.push(`step_id ${stepId} is not mapped to epic ${epicId}`);
    }

    const changedFiles = Array.isArray(record.files_changed) ? record.files_changed : [];
    const allowedPatterns = Array.isArray(epicCatalog.allowed_file_patterns)
      ? epicCatalog.allowed_file_patterns
      : [];

    for (const changed of changedFiles) {
      if (matchesAnyPattern(changed, noTouchZones)) {
        errors.push(`no-touch violation: ${changed}`);
      }

      if (allowedPatterns.length > 0 && !matchesAnyPattern(changed, allowedPatterns)) {
        errors.push(`out-of-scope file for ${epicId}: ${changed}`);
      }
    }
  }

  const checks = Array.isArray(record.checks) ? record.checks : [];
  const blockingFailures = checks.filter(
    check => (check.required ?? true) && check.status !== 'pass'
  );
  const advisoryFailures = checks.filter(
    check => check.required === false && check.status !== 'pass'
  );

  if (blockingFailures.length > 0) {
    errors.push(
      `blocking checks failed: ${blockingFailures.map(check => check.name).join(', ')}`
    );
  }

  if (advisoryFailures.length > 0) {
    warnings.push(
      `advisory checks reported non-pass statuses: ${advisoryFailures
        .map(check => `${check.name}(${check.status})`)
        .join(', ')}`
    );
  }

  if (mode === 'advisory' && record.result === 'fail' && blockingFailures.length === 0) {
    warnings.push('result=fail while only advisory checks failed; non-blocking behavior expected');
  }

  return { ok: errors.length === 0, errors, warnings };
}

function asNumber(value, fallback = NaN) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function evaluatePromotionDecision(decision) {
  if (!decision || typeof decision !== 'object') {
    throw new Error('promotion decision payload must be an object');
  }

  const thresholds = decision.thresholds || {};
  const unmet = [];

  const phaseCRegressions = asNumber(thresholds.phase_c_control_regressions);
  if (!(phaseCRegressions === 0)) {
    unmet.push('phase_c_control_regressions must equal 0');
  }

  const unrelatedNoise = asNumber(thresholds.unrelated_pr_noise_pct);
  if (!(unrelatedNoise < 10)) {
    unmet.push('unrelated_pr_noise_pct must be < 10');
  }

  const usefulness = asNumber(thresholds.retrieval_usefulness_pct);
  if (!(usefulness >= 70)) {
    unmet.push('retrieval_usefulness_pct must be >= 70');
  }

  const runtimeIncrease = asNumber(thresholds.gate_runtime_increase_pct);
  if (!(runtimeIncrease < 15)) {
    unmet.push('gate_runtime_increase_pct must be < 15');
  }

  if (thresholds.boundary_report_stable !== true) {
    unmet.push('boundary_report_stable must be true');
  }

  const tenantRegressions = asNumber(thresholds.tenant_boundary_regressions);
  if (!(tenantRegressions === 0)) {
    unmet.push('tenant_boundary_regressions must equal 0');
  }

  const consecutiveWeeks = asNumber(thresholds.consecutive_weeks);
  if (!(consecutiveWeeks >= 2)) {
    unmet.push('consecutive_weeks must be >= 2');
  }

  const passFail = unmet.length === 0;

  return {
    ...decision,
    pass_fail: passFail,
    effective_mode: passFail ? 'enforced' : 'advisory',
    unmet_thresholds: unmet,
  };
}

function printUsage() {
  console.log(`plan-conformance gate

Usage:
  node scripts/plan-conformance/gate.mjs check-step --record <path> [--charter-map <path>] [--no-touch-manifest <path>]
  node scripts/plan-conformance/gate.mjs evaluate-promotion --decision <path>
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {
    command: command || '',
    recordPath: '',
    decisionPath: '',
    charterMapPath: DEFAULT_CHARTER_MAP,
    noTouchManifestPath: DEFAULT_NO_TOUCH_MANIFEST,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const next = rest[index + 1];

    if (token === '--record' && next) {
      args.recordPath = next;
      index += 1;
      continue;
    }

    if (token === '--decision' && next) {
      args.decisionPath = next;
      index += 1;
      continue;
    }

    if (token === '--charter-map' && next) {
      args.charterMapPath = next;
      index += 1;
      continue;
    }

    if (token === '--no-touch-manifest' && next) {
      args.noTouchManifestPath = next;
      index += 1;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.command = 'help';
    }
  }

  return args;
}

function runCheckStep(args) {
  if (!args.recordPath) {
    throw new Error('check-step requires --record');
  }

  const record = readJson(args.recordPath);
  const result = validateConformanceRecord(record, {
    charterMapPath: args.charterMapPath,
    noTouchManifestPath: args.noTouchManifestPath,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function runEvaluatePromotion(args) {
  if (!args.decisionPath) {
    throw new Error('evaluate-promotion requires --decision');
  }

  const decision = readJson(args.decisionPath);
  const result = evaluatePromotionDecision(decision);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass_fail) {
    process.exitCode = 1;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'help' || !args.command) {
    printUsage();
    return;
  }

  if (args.command === 'check-step') {
    runCheckStep(args);
    return;
  }

  if (args.command === 'evaluate-promotion') {
    runEvaluatePromotion(args);
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[plan-conformance/gate] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}

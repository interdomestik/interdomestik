#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REGISTRY_PATH = path.join('docs', 'plans', '2026-03-03-memory-registry.jsonl');
const DEFAULT_POLICY_PATH = path.join('scripts', 'plan-conformance', 'memory-promotion-policy.json');
const DEFAULT_OUT_PATH = path.join('tmp', 'plan-conformance', 'memory-promotion-decision.json');
const VALID_STATUSES = new Set(['candidate', 'validated', 'canonical', 'obsolete']);
const VALID_APPROVAL_TYPES = new Set(['auto_policy', 'owner', 'hitl']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function parseJsonl(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`memory registry not found: ${absolutePath}`);
  }

  return fs
    .readFileSync(absolutePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSON on line ${index + 1}: ${error.message}`);
      }
    });
}

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeJsonl(filePath, records) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const lines = records.map(record => JSON.stringify(record)).join('\n');
  fs.writeFileSync(absolutePath, lines.length > 0 ? `${lines}\n` : '', 'utf8');
}

function normalizeApprovalType(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.trim();
  return VALID_APPROVAL_TYPES.has(normalized) ? normalized : '';
}

function normalizeApprover(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function getAllowedTargets(policy, fromStatus) {
  const transitions = policy?.transitions;
  if (!transitions || typeof transitions !== 'object') {
    return [];
  }

  const targets = transitions[fromStatus];
  return Array.isArray(targets) ? targets : [];
}

function getTransitionRequirements(policy, record, toStatus) {
  const perRule = policy?.approval_rules?.[record?.promotion_rule]?.[toStatus];
  if (perRule && typeof perRule === 'object') {
    return perRule;
  }

  return policy?.default_transition_requirements || {};
}

export function evaluateMemoryPromotion({
  record,
  toStatus,
  approvalType,
  approvedBy,
  autoPolicyPass,
  policy,
}) {
  if (!record || typeof record !== 'object') {
    throw new Error('record must be an object');
  }

  if (!VALID_STATUSES.has(record.status)) {
    throw new Error(`unsupported current status: ${record.status}`);
  }

  if (!VALID_STATUSES.has(toStatus)) {
    throw new Error(`unsupported target status: ${toStatus}`);
  }

  if (record.status === toStatus) {
    return {
      pass_fail: false,
      reasons: ['target status is unchanged'],
    };
  }

  const allowedTargets = getAllowedTargets(policy, record.status);
  if (!allowedTargets.includes(toStatus)) {
    return {
      pass_fail: false,
      reasons: [`transition not allowed: ${record.status} -> ${toStatus}`],
    };
  }

  const requirements = getTransitionRequirements(policy, record, toStatus);
  const normalizedApprovalType = normalizeApprovalType(approvalType);
  const normalizedApprover = normalizeApprover(approvedBy);
  const reasons = [];

  const allowedApprovalTypes = Array.isArray(requirements.allowed_approval_types)
    ? requirements.allowed_approval_types
    : [];

  if (allowedApprovalTypes.length > 0 && !allowedApprovalTypes.includes(normalizedApprovalType)) {
    reasons.push(
      `approval_type must be one of: ${allowedApprovalTypes.join(', ')} for ${toStatus} transition`
    );
  }

  if (requirements.requires_approver === true && normalizedApprover.length === 0) {
    reasons.push('approved_by is required for this transition');
  }

  if (requirements.requires_auto_policy_pass === true && autoPolicyPass !== true) {
    reasons.push('auto_policy_pass must be true for this transition');
  }

  return {
    pass_fail: reasons.length === 0,
    reasons,
    approval_type: normalizedApprovalType,
    approved_by: normalizedApprover,
  };
}

export function applyPromotion(records, memoryId, toStatus, nowIso) {
  return records.map(record => {
    if (record?.id !== memoryId) {
      return record;
    }

    return {
      ...record,
      status: toStatus,
      updated_at: nowIso,
    };
  });
}

function printUsage() {
  console.log(
    'memory-promote\\n\\nUsage:\\n  node scripts/plan-conformance/memory-promote.mjs --memory-id <id> --to-status <status> [--approval-type auto_policy|owner|hitl] [--approved-by <name>] [--auto-policy-pass] [--registry <path>] [--policy <path>] [--out <path>] [--apply] [--registry-out <path>]'
  );
}

function parseArgs(argv) {
  const args = {
    memoryId: '',
    toStatus: '',
    approvalType: '',
    approvedBy: '',
    autoPolicyPass: false,
    registryPath: DEFAULT_REGISTRY_PATH,
    policyPath: DEFAULT_POLICY_PATH,
    outPath: DEFAULT_OUT_PATH,
    apply: false,
    registryOutPath: '',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--memory-id' && next) {
      args.memoryId = next;
      index += 1;
      continue;
    }

    if (token === '--to-status' && next) {
      args.toStatus = next;
      index += 1;
      continue;
    }

    if (token === '--approval-type' && next) {
      args.approvalType = next;
      index += 1;
      continue;
    }

    if (token === '--approved-by' && next) {
      args.approvedBy = next;
      index += 1;
      continue;
    }

    if (token === '--auto-policy-pass') {
      args.autoPolicyPass = true;
      continue;
    }

    if (token === '--registry' && next) {
      args.registryPath = next;
      index += 1;
      continue;
    }

    if (token === '--policy' && next) {
      args.policyPath = next;
      index += 1;
      continue;
    }

    if (token === '--out' && next) {
      args.outPath = next;
      index += 1;
      continue;
    }

    if (token === '--apply') {
      args.apply = true;
      continue;
    }

    if (token === '--registry-out' && next) {
      args.registryOutPath = next;
      index += 1;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.help = true;
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.memoryId) {
    throw new Error('--memory-id is required');
  }

  if (!args.toStatus) {
    throw new Error('--to-status is required');
  }

  const records = parseJsonl(args.registryPath);
  const policy = readJson(args.policyPath);
  const record = records.find(item => item?.id === args.memoryId);

  if (!record) {
    throw new Error(`memory id not found: ${args.memoryId}`);
  }

  const evaluation = evaluateMemoryPromotion({
    record,
    toStatus: args.toStatus,
    approvalType: args.approvalType,
    approvedBy: args.approvedBy,
    autoPolicyPass: args.autoPolicyPass,
    policy,
  });

  const nowIso = new Date().toISOString();
  const decision = {
    version: '1.0.0',
    mode: 'advisory',
    evaluated_at: nowIso,
    memory_id: record.id,
    from_status: record.status,
    to_status: args.toStatus,
    promotion_rule: record.promotion_rule,
    approval_type: evaluation.approval_type || normalizeApprovalType(args.approvalType),
    approved_by: evaluation.approved_by || normalizeApprover(args.approvedBy),
    auto_policy_pass: args.autoPolicyPass,
    pass_fail: evaluation.pass_fail,
    reasons: evaluation.reasons,
    applied: false,
    registry_out: '',
  };

  if (args.apply && decision.pass_fail) {
    const updatedRecords = applyPromotion(records, record.id, args.toStatus, nowIso);
    const registryOut = args.registryOutPath || args.registryPath;
    writeJsonl(registryOut, updatedRecords);
    decision.applied = true;
    decision.registry_out = path.resolve(registryOut);
  }

  writeJson(args.outPath, decision);
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);

  if (!decision.pass_fail) {
    process.exitCode = 1;
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[memory-promote] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}

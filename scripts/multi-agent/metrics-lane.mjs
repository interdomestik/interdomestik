#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { computeRoleMetrics } from './benchmark-core.mjs';

function parseArgs(argv) {
  const parsed = {
    events: '',
    profile: 'scripts/multi-agent/role-cost-profile.json',
    out: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '-h' || token === '--help') {
      parsed.help = true;
      continue;
    }
    if (token === '--events' && next) {
      parsed.events = next;
      i += 1;
      continue;
    }
    if (token === '--profile' && next) {
      parsed.profile = next;
      i += 1;
      continue;
    }
    if (token === '--out' && next) {
      parsed.out = next;
      i += 1;
      continue;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`metrics-lane

Usage:
  node scripts/multi-agent/metrics-lane.mjs --events tmp/multi-agent/run-.../events.ndjson --out tmp/multi-agent/run-.../role-scorecard.json

Options:
  --events <path>     NDJSON events file emitted by orchestrator
  --profile <path>    Role token/cost profile (default: scripts/multi-agent/role-cost-profile.json)
  --out <path>        Output JSON path
  -h, --help          Show help
`);
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readProfile(profilePath) {
  const absolutePath = path.resolve(profilePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function readEvents(eventsPath) {
  const absolutePath = path.resolve(eventsPath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function roleCostModel(profile, role) {
  if (profile[role]) return profile[role];
  return profile.default || { tokensPerRun: 0, usdPer1kTokens: 0 };
}

export function enrichEvents(events, profile) {
  return events.map(event => {
    const role = String(event.role || 'unknown');
    const model = roleCostModel(profile, role);
    const tokenCount = Math.max(0, Math.round(asNumber(event.tokenCount, model.tokensPerRun ?? 0)));
    const usdPer1k = Math.max(0, asNumber(event.usdPer1kTokens, model.usdPer1kTokens ?? 0));
    const costUsd = Math.max(0, asNumber(event.costUsd, (tokenCount / 1000) * usdPer1k));
    return {
      role,
      success: asNumber(event.status, 1) === 0,
      latencyMs: Math.max(0, Math.round(asNumber(event.latencyMs, 0))),
      tokenCount,
      costUsd,
      label: String(event.label || ''),
      timestamp: event.timestamp || new Date().toISOString(),
    };
  });
}

function writeJson(outputPath, payload) {
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.events) {
    throw new Error('Missing required --events argument');
  }
  if (!args.out) {
    throw new Error('Missing required --out argument');
  }

  const profile = readProfile(args.profile);
  const rawEvents = readEvents(args.events);
  const executions = enrichEvents(rawEvents, profile);
  const roleMetrics = computeRoleMetrics(executions);
  const output = {
    generatedAt: new Date().toISOString(),
    sourceEvents: path.resolve(args.events),
    totalSteps: executions.length,
    roleMetrics,
  };

  writeJson(args.out, output);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[metrics-lane] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}

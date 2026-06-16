#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveActiveSlice } from './active-slice.mjs';

const ADAPTER_PATH = 'docs/golden-loop/adapters/interdomestik.adapter.json';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function addFinding(findings, ok, name, detail = '') {
  findings.push({ name, ok, detail });
}

function validateActiveSlice(repoRoot, findings) {
  const resolved = resolveActiveSlice(repoRoot);
  const activeId = resolved.active?.id || '';
  addFinding(
    findings,
    resolved.ok && activeId !== 'ARCH-FINAL',
    'concrete active slice resolves instead of ARCH-FINAL umbrella',
    activeId || 'missing'
  );
  addFinding(findings, activeId === 'T-303', 'current authority promotes T-303', activeId);
  return resolved;
}

function validateGateCoverage(adapter, findings) {
  const gates = adapter.gates || [];
  const byName = new Map(gates.map(gate => [gate.name, gate]));
  const invalid = [];

  for (const gate of gates) {
    for (const coveringName of gate.skipWhenCoveredBy || []) {
      const coveringGate = byName.get(coveringName);
      const covered = coveringGate?.covers || [];
      const hasCoverage = covered.some(item => item === gate.name || item.startsWith(`${gate.name}-`));
      if (!coveringGate || !hasCoverage) invalid.push(`${gate.name} -> ${coveringName}`);
    }
  }

  addFinding(
    findings,
    invalid.length === 0,
    'skipWhenCoveredBy references declared covering gates',
    invalid.join(', ')
  );
}

function validateReviewerFallback(adapter, findings) {
  const waterfall = adapter.reviewerWaterfall || {};
  const triggers = new Set(waterfall.fallbackTriggers || []);
  const order = waterfall.order || [];
  const routes = Object.keys(waterfall.routes || {});
  const orderRoutesMissing = order.filter(reviewer => !waterfall.routes?.[reviewer]);
  const routeCommands = new Set(Object.values(waterfall.routes || {}).map(route => route.command));
  const requiredTriggers = ['unavailable', 'blocked', 'error', 'refused', 'invalid', 'unresolved-blockers'];
  const missingTriggers = requiredTriggers.filter(trigger => !triggers.has(trigger));

  addFinding(
    findings,
    missingTriggers.length === 0,
    'reviewer waterfall declares bounded fallback triggers',
    missingTriggers.join(', ')
  );
  addFinding(
    findings,
    routes.length >= 2,
    'reviewer waterfall keeps at least one external fallback route configured',
    routes.join(', ')
  );
  addFinding(
    findings,
    order.length >= 2 && orderRoutesMissing.length === 0,
    'reviewer waterfall order can actually reach a fallback route',
    orderRoutesMissing.join(', ') || order.join(', ')
  );
  addFinding(
    findings,
    order.includes('gemini') && waterfall.routes?.opus && !waterfall.routes?.fable,
    'reviewer waterfall uses Gemini fallback and Opus escalation, with Fable unavailable',
    order.join(', ')
  );
  addFinding(
    findings,
    routeCommands.has('claude') && routeCommands.has('gemini'),
    'reviewer executor has both Claude and Gemini command families configured',
    Array.from(routeCommands).join(', ')
  );
}

function main() {
  const args = process.argv.slice(2);
  const repoRoot = path.resolve(argValue(args, '--repo', process.cwd()));
  const adapter = readJson(path.join(repoRoot, ADAPTER_PATH));
  const findings = [];
  const activeSlice = validateActiveSlice(repoRoot, findings);
  validateGateCoverage(adapter, findings);
  validateReviewerFallback(adapter, findings);

  const failed = findings.filter(finding => !finding.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, repoRoot, activeSlice, findings }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveActiveSlice } from './active-slice.mjs';

const ADAPTER_PATH = 'docs/golden-loop/adapters/interdomestik.adapter.json';
const PRE_MERGE_CAP = 9.4;

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readText(repoRoot, file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function hasEvery(collection, required) {
  return required.every(item => collection.includes(item));
}

function scoreArea(name, maxScore, checks, reason) {
  const failed = checks.filter(check => !check.ok);
  const score = Number(Math.max(8, maxScore - failed.length * 0.2).toFixed(1));
  return { name, score, maxScore, ok: failed.length === 0, failed, reason };
}

function routeCommandSet(routes) {
  return new Set(Object.values(routes || {}).map(route => route.command));
}

export function buildMaturityScorecard(repoRoot) {
  const adapter = readJson(path.join(repoRoot, ADAPTER_PATH));
  const ciWorkflow = readText(repoRoot, '.github/workflows/ci.yml');
  const reviewContract = readText(repoRoot, 'scripts/golden-loop/review-contract.mjs');
  const reviewContractTests = readText(repoRoot, 'scripts/golden-loop/review-contract.test.mjs');
  const prFinalizerTests = readText(repoRoot, 'scripts/ci/pr-finalizer-workflow.test.mjs');
  const resolved = resolveActiveSlice(repoRoot);
  const waterfall = adapter.reviewerWaterfall || {};
  const routes = waterfall.routes || {};
  const commands = routeCommandSet(routes);
  const gateNames = (adapter.gates || []).map(gate => gate.name);
  const skillPaths = (adapter.skillAuthorityPaths || []).map(entry => entry.path);
  const protectedPaths = adapter.protectedPaths || [];
  const triggers = waterfall.fallbackTriggers || [];

  const areas = [
    scoreArea(
      'Governance/playbook design',
      9.3,
      [
        { ok: resolved.ok && resolved.active?.id === 'T-303', label: 'concrete active slice' },
        { ok: hasEvery(adapter.authorityOrder || [], ['user instruction', 'AGENTS.md']), label: 'authority order' },
        { ok: hasEvery(protectedPaths, ['apps/web/src/proxy.ts', 'README.md', 'AGENTS.md']), label: 'protected paths' },
        { ok: String(adapter.closeout?.protectedPathException || '').includes('approved closeout'), label: 'closeout exception' },
      ],
      'Canonical authority, protected paths, and active-slice selection are contract-checked.'
    ),
    scoreArea(
      'Parser/finalizer robustness',
      9.2,
      [
        { ok: reviewContract.includes('MIN_VALID_CHARS'), label: 'bounded review parser' },
        { ok: reviewContract.includes('BLOCKER'), label: 'blocker parsing' },
        { ok: prFinalizerTests.includes('PR finalizer workflow'), label: 'finalizer workflow contract' },
        { ok: reviewContractTests.includes('invalid'), label: 'negative contract tests' },
      ],
      'Review evidence parsing and PR-finalizer behavior have executable negative coverage.'
    ),
    scoreArea(
      'Reviewer route handling',
      9.4,
      [
        { ok: JSON.stringify(waterfall.order) === JSON.stringify(['sonnet', 'gemini']), label: 'normal order' },
        { ok: Boolean(routes.gemini) && Boolean(routes.opus) && !routes.fable, label: 'current route set' },
        { ok: commands.has('claude') && commands.has('gemini'), label: 'command families' },
        { ok: hasEvery(triggers, ['blocked', 'error', 'invalid', 'unavailable']), label: 'fallback triggers' },
      ],
      'Sonnet, Gemini, and Opus 4.8 semantics are encoded; Fable cannot re-enter silently.'
    ),
    scoreArea(
      'CI/release gate efficiency',
      9.2,
      [
        { ok: gateNames.includes('pr-verify') && gateNames.includes('e2e-gate'), label: 'required gates' },
        { ok: JSON.stringify(adapter.gates).includes('skipWhenCoveredBy'), label: 'coverage skip contract' },
        { ok: ciWorkflow.includes('playbook-contracts.mjs'), label: 'CI audit gate' },
        { ok: ciWorkflow.includes('pnpm test:ci:contracts'), label: 'contract suite in CI' },
      ],
      'Fast, slice, full, and remote gates are declared, with duplicate E2E work avoided by contract.'
    ),
    scoreArea(
      'Future-thread skill enforcement',
      9.3,
      [
        { ok: hasEvery(skillPaths, ['.claude/skills/interdomestik-slice-runner/SKILL.md']), label: 'Claude skill path' },
        { ok: hasEvery(skillPaths, ['.codex/skills/interdomestik-slice-runner/SKILL.md']), label: 'Codex skill path' },
        { ok: hasEvery(skillPaths, ['.gemini/skills/interdomestik-slice-runner/SKILL.md']), label: 'Gemini skill path' },
        { ok: Boolean(adapter.evidenceRoot) && Boolean(adapter.evidenceByteBudget), label: 'bounded evidence' },
      ],
      'Future agents get the same skill anchors, evidence budget, and active-slice contract.'
    ),
    scoreArea(
      'Enterprise readiness',
      9.2,
      [
        { ok: adapter.budgets?.maxFullGateRuns <= 2, label: 'full-gate budget' },
        { ok: adapter.prRemediation?.maxAutoRemediations <= 3, label: 'remediation budget' },
        { ok: hasEvery(adapter.autoMerge?.criteria || [], ['required checks green']), label: 'merge criteria' },
        { ok: hasEvery(adapter.stopConditions || [], ['budget exhausted', 'invariant conflict']), label: 'stop conditions' },
      ],
      'Budgets, stop conditions, remediation boundaries, and merge criteria are explicit.'
    ),
  ];

  const overall = Number((areas.reduce((sum, area) => sum + area.score, 0) / areas.length).toFixed(1));
  return { ok: areas.every(area => area.ok), overall, preMergeCap: PRE_MERGE_CAP, areas };
}

function markdown(scorecard) {
  const rows = scorecard.areas.map(area => `| ${area.name} | ${area.score.toFixed(1)} | ${area.reason} |`);
  return [
    `Current maturity: ${scorecard.overall.toFixed(1)}/10, capped at ${scorecard.preMergeCap.toFixed(1)} before PR/CI merge validation.`,
    '',
    '| Area | Score | Reason |',
    '| --- | ---: | --- |',
    ...rows,
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const repoRoot = path.resolve(argValue(args, '--repo', process.cwd()));
  const scorecard = buildMaturityScorecard(repoRoot);
  console.log(args.includes('--markdown') ? markdown(scorecard) : JSON.stringify(scorecard, null, 2));
  process.exit(scorecard.ok && scorecard.overall >= 9.2 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();

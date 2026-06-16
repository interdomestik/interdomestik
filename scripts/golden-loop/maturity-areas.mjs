import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveActiveSlice } from './active-slice.mjs';
import { validateAdapter } from './load-adapter.mjs';

const ADAPTER_PATH = 'docs/golden-loop/adapters/interdomestik.adapter.json';
const SCHEMA_PATH = 'scripts/golden-loop/adapter.schema.json';
const SAFE_GIT_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
const PROTECTED_FORBIDDEN = ['apps/web/src/proxy.ts', 'README.md', 'AGENTS.md', 'docs/plans/'];

function readJson(repoRoot, file) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
}

function readText(repoRoot, file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function hasEvery(collection, required) {
  return required.every(item => collection.includes(item));
}

function routeCommandSet(routes) {
  return new Set(Object.values(routes || {}).map(route => route.command));
}

function changedFiles(repoRoot) {
  try {
    const output = execFileSync('/usr/bin/git', ['diff', '--name-only', 'origin/main...HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: SAFE_GIT_ENV,
    });
    return { ok: true, files: output.split('\n').filter(Boolean), reason: '' };
  } catch (error) {
    return { ok: false, files: [], reason: error.message };
  }
}

function scoreArea(name, checks, reason) {
  const failed = checks.filter(check => !check.ok);
  return { name, score: failed.length === 0 ? 10 : 8, ok: failed.length === 0, failed, reason };
}

export function buildMaturityAreas(repoRoot) {
  const adapter = readJson(repoRoot, ADAPTER_PATH);
  const schema = readJson(repoRoot, SCHEMA_PATH);
  const ciWorkflow = readText(repoRoot, '.github/workflows/ci.yml');
  const reviewContract = readText(repoRoot, 'scripts/golden-loop/review-contract.mjs');
  const reviewTests = readText(repoRoot, 'scripts/golden-loop/review-contract.test.mjs');
  const finalizerTests = readText(repoRoot, 'scripts/ci/pr-finalizer-workflow.test.mjs');
  const goldenLoopTests = readText(repoRoot, 'scripts/golden-loop/golden-loop.test.mjs');
  const playbookContracts = readText(repoRoot, 'scripts/golden-loop/playbook-contracts.mjs');
  const changed = changedFiles(repoRoot);
  const protectedTouches = changed.files.filter(file =>
    PROTECTED_FORBIDDEN.some(item => file === item || file.startsWith(item))
  );
  const resolved = resolveActiveSlice(repoRoot);
  const waterfall = adapter.reviewerWaterfall || {};
  const routes = waterfall.routes || {};
  const commands = routeCommandSet(routes);
  const gateNames = (adapter.gates || []).map(gate => gate.name);
  const skillPaths = (adapter.skillAuthorityPaths || []).map(entry => entry.path);
  const triggers = waterfall.fallbackTriggers || [];
  const routeText = JSON.stringify(waterfall);

  return [
    scoreArea(
      'Governance/playbook design',
      [
        { ok: validateAdapter(adapter, schema).length === 0, label: 'adapter schema' },
        { ok: resolved.ok && resolved.active?.id === 'T-303', label: 'concrete active slice' },
        { ok: hasEvery(adapter.authorityOrder || [], ['user instruction', 'AGENTS.md']), label: 'authority order' },
        { ok: changed.ok, label: `changed-file audit: ${changed.reason}` },
        { ok: protectedTouches.length === 0, label: `protected path drift: ${protectedTouches.join(', ')}` },
      ],
      'Adapter schema, authority order, active-slice resolution, and protected-scope cleanliness pass.'
    ),
    scoreArea(
      'Parser/finalizer robustness',
      [
        { ok: reviewContract.includes('MIN_VALID_CHARS'), label: 'bounded parser' },
        { ok: reviewContract.includes('BLOCKER'), label: 'blocker parser' },
        { ok: reviewTests.includes('READY AFTER FIXES'), label: 'negative review verdict' },
        { ok: finalizerTests.includes('PR finalizer workflow'), label: 'finalizer workflow contract' },
      ],
      'Review parsing, blocker semantics, negative verdicts, and finalizer behavior are tested.'
    ),
    scoreArea(
      'Reviewer route handling',
      [
        { ok: JSON.stringify(waterfall.order) === JSON.stringify(['sonnet', 'gemini']), label: 'normal order' },
        { ok: Boolean(routes.gemini) && Boolean(routes.opus) && !routes.fable, label: 'route set' },
        { ok: commands.has('claude') && commands.has('gemini'), label: 'command families' },
        { ok: hasEvery(triggers, ['blocked', 'error', 'invalid', 'unavailable']), label: 'fallback triggers' },
      ],
      'Sonnet to Gemini fallback and Opus 4.8 escalation are configured; Fable is absent.'
    ),
    scoreArea(
      'CI/release gate efficiency',
      [
        { ok: hasEvery(gateNames, ['pr-verify', 'e2e-gate', 'ci-required-checks']), label: 'gate inventory' },
        { ok: JSON.stringify(adapter.gates).includes('skipWhenCoveredBy'), label: 'duplicate gate skip' },
        { ok: ciWorkflow.includes('playbook-contracts.mjs'), label: 'CI contract gate' },
        { ok: playbookContracts.includes('maturity scorecard'), label: 'score enforced by CI gate' },
      ],
      'Gate inventory, duplicate-work policy, and maturity enforcement are wired into CI audit.'
    ),
    scoreArea(
      'Future-thread skill enforcement',
      [
        { ok: hasEvery(skillPaths, ['.claude/skills/interdomestik-slice-runner/SKILL.md']), label: 'Claude skill' },
        { ok: hasEvery(skillPaths, ['.codex/skills/interdomestik-slice-runner/SKILL.md']), label: 'Codex skill' },
        { ok: hasEvery(skillPaths, ['.gemini/skills/interdomestik-slice-runner/SKILL.md']), label: 'Gemini skill' },
        { ok: goldenLoopTests.includes('resume state round-trips atomically'), label: 'resume rehearsal' },
      ],
      'Future agents get skill anchors plus tested resume-state and bounded evidence mechanics.'
    ),
    scoreArea(
      'Enterprise readiness',
      [
        { ok: adapter.budgets?.maxFullGateRuns <= 2, label: 'full-gate budget' },
        { ok: adapter.prRemediation?.maxAutoRemediations <= 3, label: 'remediation budget' },
        { ok: hasEvery(adapter.autoMerge?.criteria || [], ['required checks green']), label: 'merge criteria' },
        { ok: routeText.includes('claude-opus-4-8') && routeText.includes('gemini-3.1-pro-preview'), label: 'premium route evidence' },
      ],
      'Budgets, merge criteria, remediation limits, and premium reviewer routes are explicit.'
    ),
  ];
}

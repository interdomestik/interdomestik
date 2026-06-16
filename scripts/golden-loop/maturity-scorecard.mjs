#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { buildMaturityAreas } from './maturity-areas.mjs';

const TARGET_SCORE = 10;
const PRE_MERGE_VALIDATION_CAP = 9.4;

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

export function buildMaturityScorecard(repoRoot) {
  const areas = buildMaturityAreas(repoRoot);
  return buildMaturityScorecardFromAreas(areas);
}

export function buildMaturityScorecardFromAreas(areas) {
  const localReadiness = Number(
    (areas.reduce((sum, area) => sum + area.score, 0) / areas.length).toFixed(1)
  );
  const allAreasPass = areas.every(area => area.ok);
  const validatedMaturity = Number(Math.min(localReadiness, PRE_MERGE_VALIDATION_CAP).toFixed(1));
  return {
    ok: allAreasPass && localReadiness === TARGET_SCORE,
    overall: localReadiness,
    localReadiness,
    validatedMaturity,
    preMergeValidationCap: PRE_MERGE_VALIDATION_CAP,
    targetScore: TARGET_SCORE,
    evidenceMode: 'local-branch-readiness',
    areas,
  };
}

function markdown(scorecard) {
  const rows = scorecard.areas.map(area => `| ${area.name} | ${area.score.toFixed(1)} | ${area.reason} |`);
  return [
    `Local readiness: ${scorecard.localReadiness.toFixed(1)}/10 (${scorecard.evidenceMode}).`,
    `Validated maturity: ${scorecard.validatedMaturity.toFixed(1)}/10 before PR/CI merge validation.`,
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
  process.exit(scorecard.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, compareText, must, safeRelativePath } from './slice-rehearse-canonical.mjs';
import { detectReviewPaths } from './slice-rehearse-review-paths.mjs';

export const DASHBOARD_LOCALE_PATHS = Object.freeze([
  'apps/web/src/messages/en/dashboard.json',
  'apps/web/src/messages/mk/dashboard.json',
  'apps/web/src/messages/sq/dashboard.json',
  'apps/web/src/messages/sr/dashboard.json',
]);
const ACTION_STATES = Object.freeze([
  'active',
  'active_in_grace',
  'canceled',
  'grace_expired',
  'none',
  'scheduled_cancel',
  'trialing',
]);

function portal(catalog) {
  return catalog?.dashboard?.portal;
}

function leaves(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [[prefix, value]];
  return Object.keys(value)
    .sort(compareText)
    .flatMap(key => leaves(value[key], prefix ? `${prefix}.${key}` : key));
}

function placeholders(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/\{(\w+)\}/gu)].map(match => match[1]).sort(compareText);
}

function shapeOf(entries) {
  return entries.map(([key, value]) => [key, typeof value]);
}

function allDistinct(values) {
  return new Set(values).size === values.length;
}

function reviewCandidateText(path, candidateLeaves, referenceLeaves, findings) {
  for (let index = 0; index < candidateLeaves.length; index += 1) {
    const [key, value] = candidateLeaves[index];
    if (typeof value !== 'string' || value.trim() === '') {
      findings.push(`${path}:${key} must be non-empty text`);
    }
    if (
      canonicalJson(placeholders(value)) !== canonicalJson(placeholders(referenceLeaves[index][1]))
    ) {
      findings.push(`${path}:${key} placeholder parity differs`);
    }
  }
}

export function reviewDashboardLocaleParity(catalogs) {
  const findings = [];
  const present = Object.keys(catalogs ?? {}).sort(compareText);
  if (canonicalJson(present) !== canonicalJson(DASHBOARD_LOCALE_PATHS)) {
    findings.push('catalog input must contain the four exact dashboard locale paths');
  }
  const reference = portal(catalogs?.[DASHBOARD_LOCALE_PATHS[0]]);
  const referenceLeaves = leaves(reference);
  const referenceShape = shapeOf(referenceLeaves);
  for (const path of DASHBOARD_LOCALE_PATHS) {
    const candidate = portal(catalogs?.[path]);
    const candidateLeaves = leaves(candidate);
    const shape = shapeOf(candidateLeaves);
    if (canonicalJson(shape) !== canonicalJson(referenceShape)) {
      findings.push(`${path}: dashboard.portal semantic parity differs`);
      continue;
    }
    reviewCandidateText(path, candidateLeaves, referenceLeaves, findings);
    if (
      canonicalJson(Object.keys(candidate?.actions ?? {}).sort(compareText)) !==
      canonicalJson(ACTION_STATES)
    ) {
      findings.push(`${path}: action-state semantic parity differs`);
    }
    const blockedActions = ['canceled', 'grace_expired', 'none'].map(
      key => candidate?.actions?.[key]
    );
    if (!allDistinct(blockedActions)) {
      findings.push(`${path}: inactive action states must remain semantically distinct`);
    }
    const regionLabels = ['actions', 'case', 'updates'].map(
      key => candidate?.regions?.[key]?.label
    );
    if (!allDistinct(regionLabels)) {
      findings.push(`${path}: dashboard region labels must remain semantically distinct`);
    }
  }
  return { paths: [...DASHBOARD_LOCALE_PATHS], leafCount: referenceLeaves.length, findings };
}

export function inspectAccessibilityContracts(source) {
  must(typeof source === 'string', 'accessibility source is unavailable');
  const findings = [];
  if (/<div\b[^>]*\brole=["']heading["']/iu.test(source)) {
    findings.push('use a semantic heading element instead of div role=heading');
  }
  if (
    /<a\b(?=[^>]*\btarget=["']_blank["'])(?![^>]*\brel=["'][^"']*noopener)[^>]*>/iu.test(source)
  ) {
    findings.push('target=_blank links require rel=noopener');
  }
  if (/<button\b(?![^>]*\baria-label(?:ledby)?=)[^>]*>\s*<\/button>/iu.test(source)) {
    findings.push('button requires an accessible name');
  }
  return findings;
}

export function runReviewParity({ cwd = process.cwd(), changedPaths, spawn = spawnSync } = {}) {
  const paths = (changedPaths ?? detectReviewPaths(cwd, spawn)).map(path =>
    safeRelativePath(path, 'review path')
  );
  const catalogs = Object.fromEntries(
    DASHBOARD_LOCALE_PATHS.map(path => [path, JSON.parse(readFileSync(resolve(cwd, path), 'utf8'))])
  );
  const locale = reviewDashboardLocaleParity(catalogs);
  const accessibility = paths
    .filter(path => /\.[jt]sx$/u.test(path))
    .flatMap(path =>
      inspectAccessibilityContracts(readFileSync(resolve(cwd, path), 'utf8')).map(
        message => `${path}: ${message}`
      )
    );
  const reviewer = spawn(process.execPath, ['scripts/ci/reviewer-preflight.mjs', ...paths], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const findings = [...locale.findings, ...accessibility];
  if (reviewer.status !== 0) findings.push((reviewer.stderr || 'reviewer preflight failed').trim());
  const sortedFindings = [...findings].sort(compareText);
  return { schemaVersion: 1, findings: sortedFindings, localePaths: locale.paths };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const explicit = process.argv.slice(2);
    const report = runReviewParity({ changedPaths: explicit.length ? explicit : undefined });
    process.stdout.write(canonicalJson(report));
    if (report.findings.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`review parity failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

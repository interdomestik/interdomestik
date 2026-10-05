#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { responsivenessUiCatalog } from './sentry-responsiveness-alerts-lib.mjs';

export function runResponsivenessAlerts(mode = 'catalog', env = process.env, output = console.log) {
  // Reject retired remote modes before inspecting any environment/credential source.
  if (mode === 'check' || mode === 'apply') {
    throw new Error(
      'Remote check/apply is disabled: legacy Sentry alert APIs were removed on 2026-08-17. ' +
        'Use catalog and the current Monitors & Alerts UI with verified staging events and routing. ' +
        'No credentials are read and no requests are made.'
    );
  }
  if (mode !== 'catalog') throw new Error('Use catalog; remote check/apply is disabled.');
  const catalog = responsivenessUiCatalog({
    environment: env.SENTRY_ENVIRONMENT ?? 'staging',
    project: env.SENTRY_PROJECT,
  });
  output(JSON.stringify(catalog, null, 2));
  return catalog;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runResponsivenessAlerts(process.argv[2] ?? 'catalog');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Cannot generate staging catalog.');
    process.exitCode = 1;
  }
}

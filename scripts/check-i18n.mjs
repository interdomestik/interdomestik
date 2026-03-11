#!/usr/bin/env node
// Simple i18n completeness check for key namespaces used on landing/wizard.

import { collectI18nFailures, parseArgs } from './check-i18n-lib.mjs';

const { locales, baseLocale, root } = parseArgs(process.argv.slice(2));
const failures = collectI18nFailures({ root, locales, baseLocale });

if (failures.length) {
  console.error('i18n completeness check failed:');
  failures.forEach(failure => console.error(` - ${failure}`));
  process.exit(1);
} else {
  console.log('✅ i18n completeness check passed!');
}

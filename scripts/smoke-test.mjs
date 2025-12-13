#!/usr/bin/env node

/**
 * Smoke Test Suite for Interdomestik V2
 * Tests upgraded stack stability: Next.js 16, React 19, next-intl 4, Stripe 20, Zod 4
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BLUE = '\x1b[34m';

/**
 * @typedef {Object} TestResult
 * @property {string} name
 * @property {boolean} passed
 * @property {string} [message]
 * @property {number} [duration]
 */

/** @type {TestResult[]} */
const results = [];

/**
 * @param {string} message
 * @param {string} color
 */
function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

/**
 * @param {string} command
 * @param {string} description
 * @returns {boolean}
 */
function runCommand(command, description) {
  const start = Date.now();
  try {
    execSync(command, { stdio: 'pipe', encoding: 'utf-8' });
    const duration = Date.now() - start;
    results.push({ name: description, passed: true, duration });
    log(`✓ ${description} (${duration}ms)`, GREEN);
    return true;
  } catch (error) {
    const duration = Date.now() - start;
    results.push({
      name: description,
      passed: false,
      message: error instanceof Error ? error.message : String(error),
      duration,
    });
    log(`✗ ${description} (${duration}ms)`, RED);
    return false;
  }
}

/**
 * @param {string} path
 * @param {string} description
 * @returns {boolean}
 */
function checkFile(path, description) {
  if (existsSync(path)) {
    results.push({ name: description, passed: true });
    log(`✓ ${description}`, GREEN);
    return true;
  } else {
    results.push({ name: description, passed: false, message: `File not found: ${path}` });
    log(`✗ ${description}`, RED);
    return false;
  }
}

async function main() {
  log('\n🧪 Interdomestik V2 - Smoke Test Suite\n', BLUE);
  log('Testing upgraded stack stability...\n', YELLOW);

  // 1. File Structure Tests
  log('📁 File Structure Tests', BLUE);
  checkFile('package.json', 'Root package.json exists');
  checkFile('apps/web/package.json', 'Web app package.json exists');
  checkFile('packages/ui/package.json', 'UI package.json exists');
  checkFile('packages/database/package.json', 'Database package.json exists');
  checkFile('.env', 'Environment file exists');

  console.log('');

  // 2. Dependency Tests
  log('📦 Dependency Tests', BLUE);
  runCommand('pnpm list react --depth=0 --filter @interdomestik/web', 'React 19 installed');
  runCommand('pnpm list next --depth=0 --filter @interdomestik/web', 'Next.js 16 installed');
  runCommand('pnpm list next-intl --depth=0 --filter @interdomestik/web', 'next-intl 4 installed');
  runCommand('pnpm list stripe --depth=0 --filter @interdomestik/web', 'Stripe 20 installed');
  runCommand('pnpm list zod --depth=0 --filter @interdomestik/web', 'Zod 4 installed');

  console.log('');

  // 3. TypeScript Tests
  log('🔷 TypeScript Tests', BLUE);
  runCommand('pnpm run type-check --filter @interdomestik/ui', 'UI package type-check');
  runCommand('pnpm run type-check --filter @interdomestik/database', 'Database package type-check');
  runCommand('pnpm run type-check --filter @interdomestik/web', 'Web app type-check');

  console.log('');

  // 4. Lint Tests
  log('🔍 Lint Tests', BLUE);
  runCommand('pnpm run lint --filter @interdomestik/ui', 'UI package lint');
  runCommand('pnpm run lint --filter @interdomestik/web', 'Web app lint');

  console.log('');

  // 5. Build Tests
  log('🏗️  Build Tests', BLUE);
  runCommand('pnpm run build --filter @interdomestik/ui', 'UI package build');
  runCommand('pnpm run build --filter @interdomestik/database', 'Database package build');
  runCommand('pnpm run build --filter @interdomestik/web', 'Web app build');

  console.log('');

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  log('\n📊 Test Summary', BLUE);
  log(`Total: ${total} tests`, RESET);
  log(`Passed: ${passed} tests`, GREEN);
  if (failed > 0) {
    log(`Failed: ${failed} tests`, RED);
  }

  const passRate = ((passed / total) * 100).toFixed(1);
  log(`Pass Rate: ${passRate}%\n`, passRate === '100.0' ? GREEN : YELLOW);

  if (failed > 0) {
    log('❌ Failed Tests:', RED);
    results
      .filter(r => !r.passed)
      .forEach(r => {
        log(`  - ${r.name}`, RED);
        if (r.message) {
          log(`    ${r.message.split('\n')[0]}`, YELLOW);
        }
      });
    console.log('');
    process.exit(1);
  } else {
    log('✅ All tests passed! Stack is stable.', GREEN);
    process.exit(0);
  }
}

main().catch(error => {
  log(`\n❌ Smoke test failed: ${error.message}`, RED);
  process.exit(1);
});

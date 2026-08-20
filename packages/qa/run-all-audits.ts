#!/usr/bin/env tsx
import chalk from 'chalk';
import 'dotenv/config';
import {
  auditAccessibility,
  auditAuth,
  auditCsp,
  auditDependencies,
  auditEnv,
  auditNavigation,
  auditPerformance,
  auditSupabase,
} from './src/tools/audits.js';
import { checkHealth } from './src/tools/health.js';
import { classifyAuditResult } from './src/utils/audit-result.js';
import { REPO_ROOT } from './src/utils/paths.js';

// Helper to extract text from MCP response format
function extractText(result: any): string {
  if (typeof result === 'string') return result;
  if (result?.content?.[0]?.text) return result.content[0].text;
  return JSON.stringify(result, null, 2);
}

async function runAllAudits() {
  console.log(chalk.bold.cyan('\n🔍 Running All QA Audits for Interdomestik V2\n'));
  console.log('='.repeat(60));

  const audits = [
    { name: 'Health Check', fn: () => checkHealth({ repoRoot: REPO_ROOT }) },
    { name: 'Auth Audit', fn: auditAuth },
    { name: 'Environment Audit', fn: auditEnv },
    { name: 'Navigation Audit', fn: auditNavigation },
    { name: 'Dependencies Audit', fn: auditDependencies },
    { name: 'Supabase Audit', fn: auditSupabase },
    { name: 'Accessibility Audit', fn: auditAccessibility },
    { name: 'CSP Audit', fn: auditCsp },
    { name: 'Performance Audit', fn: auditPerformance },
  ];

  const results: Array<{ name: string; status: 'pass' | 'fail' | 'warning'; output: string }> = [];

  for (const audit of audits) {
    console.log(chalk.bold.yellow(`\n📋 ${audit.name}...`));
    console.log('-'.repeat(60));

    try {
      const result = await audit.fn();
      const text = extractText(result);
      console.log(text);

      const status = classifyAuditResult(result, text);
      results.push({ name: audit.name, status, output: text });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`❌ Error: ${errorMsg}`));
      results.push({ name: audit.name, status: 'fail', output: errorMsg });
    }
  }

  // Summary
  console.log(chalk.bold.cyan('\n\n📊 AUDIT SUMMARY'));
  console.log('='.repeat(60));

  const passed = results.filter(r => r.status === 'pass').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  const failed = results.filter(r => r.status === 'fail').length;

  results.forEach(r => {
    let icon = '❌';
    let color = chalk.red;

    if (r.status === 'pass') {
      icon = '✅';
      color = chalk.green;
    } else if (r.status === 'warning') {
      icon = '⚠️';
      color = chalk.yellow;
    }
    console.log(color(`${icon} ${r.name}`));
  });

  console.log('\n' + '='.repeat(60));
  console.log(chalk.green(`✅ Passed: ${passed}`));
  console.log(chalk.yellow(`⚠️  Warnings: ${warnings}`));
  console.log(chalk.red(`❌ Failed: ${failed}`));
  console.log('='.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

void runAllAudits().catch(console.error);

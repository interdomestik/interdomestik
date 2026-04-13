import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();

function runModuleExpression(modulePath, expression) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, modulePath)).href;
  const script = `
    const mod = await import(${JSON.stringify(moduleUrl)});
    const result = await (${expression});
    console.log(JSON.stringify(result));
  `;

  const stdout = execFileSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return JSON.parse(stdout);
}

test('runSecurityGuard returns structured content with command metadata', () => {
  const result = runModuleExpression(
    'packages/qa/src/tools/tests.ts',
    'mod.runSecurityGuard()'
  );

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.tool, 'security_guard');
  assert.equal(result.structuredContent.status, 'pass');
  assert.equal(result.structuredContent.command, 'pnpm security:guard');
  assert.equal(result.structuredContent.failedStage, null);
  assert.equal(typeof result.structuredContent.durationMs, 'number');
  assert.match(result.content[0].text, /SECURITY GUARD PASSED/);
});

test('execAsync classifies failed check:fast output by the active stage marker', () => {
  const result = runModuleExpression(
    'packages/qa/src/utils/exec.ts',
    `mod.classifyVerificationFailure('pnpm check:fast', ['> interdomestik@0.1.0 e2e:state:setup /repo', 'boom'].join('\\n'))`
  );

  assert.equal(result.failedStage, 'e2e_state_setup');
  assert.equal(result.failureCategory, 'e2e');
});

test('execAsync truncates oversized stdout without failing the command', () => {
  const nodeCommand = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
    "process.stdout.write('x'.repeat(20000))"
  )}`;

  const result = runModuleExpression(
    'packages/qa/src/utils/exec.ts',
    `mod.execAsync(${JSON.stringify(nodeCommand)}, { cwd: ${JSON.stringify(
      repoRoot
    )}, maxOutputBytes: 1024 })`
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stdoutTruncated, true);
  assert.ok(result.stdout.length <= 1024);
  assert.equal(result.stderrTruncated, false);
});

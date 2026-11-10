import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSeed(file: string): string {
  return readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
}

test('runner and assertion preflight precede DB initialization', () => {
  for (const [file, entry] of [
    ['seed.ts', 'main'],
    ['seed-assert.ts', 'assertSeed'],
  ]) {
    const source = readSeed(file);
    assert.match(
      source,
      new RegExp(`async function ${entry}\\(\\) \\{\\s*assertSeedTargetAllowed\\(process.env\\);`)
    );
    const preflight = source.indexOf('assertSeedTargetAllowed(process.env)');
    assert.ok(preflight < source.indexOf("await import('./db')"));
    assert.ok(!source.includes('SEED_ALLOW_RESET'));
    if (file === 'seed.ts') {
      const envLoaded = source.indexOf('\nloadEnvFromRoot();');
      assert.ok(envLoaded > 0 && envLoaded < preflight);
      assert.ok(source.indexOf('\n  main();') > preflight);
    }
  }
});

test('exported golden, full, workload and agent-pack entry points preflight first', () => {
  const entries = [
    ['seed-golden/index.ts', 'seedGolden'],
    ['seed-full/index.ts', 'seedFull'],
    ['seed-workload/index.ts', 'seedWorkload'],
    ['seed-packs/agent-pack.ts', 'seedAgentPack'],
    ['seed-packs/ks-workflow-pack.ts', 'seedKsWorkflowPack'],
  ];
  for (const [file, entry] of entries) {
    assert.match(
      readSeed(file),
      new RegExp(
        `export async function ${entry}\\(config: SeedConfig\\) \\{\\s*assertSeedTargetAllowed\\(process.env\\);`
      )
    );
  }
});

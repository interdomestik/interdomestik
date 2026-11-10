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
      new RegExp(
        `async function ${entry}\\(\\) \\{\\s*(?:const targetClassification = )?assertSeedTargetAllowed\\(process.env\\);`
      )
    );
    const preflight = source.indexOf('assertSeedTargetAllowed(process.env)');
    assert.ok(preflight < source.indexOf('await importSeedDatabase()'));
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
    // full/workload hash fixed public passwords, so they also refuse every non-local target.
    const mode = /seed-(full|workload)\//.exec(file)?.[1];
    const call = mode
      ? `assertSeedModeAllowed\\('${mode}', assertSeedTargetAllowed\\(process.env\\)\\);`
      : 'assertSeedTargetAllowed\\(process.env\\);';
    assert.match(
      readSeed(file),
      new RegExp(`export async function ${entry}\\(config: SeedConfig\\) \\{\\s*${call}`)
    );
  }
  for (const [file] of entries) {
    assert.ok(readSeed(file).includes('await importSeedDatabase()'));
    assert.doesNotMatch(readSeed(file), /await import\(['"].*\/db['"]\)/);
  }
  const runner = readSeed('seed.ts');
  assert.ok(
    runner.indexOf('assertSeedModeAllowed(mode, targetClassification)') <
      runner.indexOf('await importSeedDatabase()')
  );
});

test('pilot multi-seeder validates before importing the database package', () => {
  const source = readFileSync(
    new URL('../../../scripts/pilot/day1_multi_seeder.ts', import.meta.url),
    'utf8'
  );
  assert.match(source, /async function main\(\) \{\s*assertSeedTargetAllowed\(process.env\);/);
  const preflight = source.indexOf('assertSeedTargetAllowed(process.env)');
  assert.ok(preflight < source.indexOf("await import('@interdomestik/database')"));
  const imported = source.indexOf("await import('@interdomestik/database')");
  const recheck = source.indexOf('assertSeedTargetAllowed(process.env)', imported);
  assert.ok(recheck > imported && recheck < source.indexOf('await db.'));
  assert.doesNotMatch(source, /from ['"]@interdomestik\/database['"]/);
  assert.match(
    source,
    /import \{ assertSeedTargetAllowed \} from ['"].*\/src\/seed-target-guard['"]/
  );
  // The package entry stays free of seed code; the pilot imports the guard by path.
  assert.doesNotMatch(readSeed('index.ts'), /seed-target-guard/);
});

test('database import helper checks both before and after module evaluation', () => {
  const source = readSeed('seed-target-guard.ts');
  const helper = source.slice(source.indexOf('export async function importSeedDatabase'));
  const imported = helper.indexOf("await import('./db')");
  assert.ok(helper.indexOf('assertSeedTargetAllowed(process.env)') < imported);
  const recheck = helper.indexOf('assertSeedTargetAllowed(process.env)', imported);
  assert.ok(recheck > imported && recheck < helper.indexOf('return database;'));
});

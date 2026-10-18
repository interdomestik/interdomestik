import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// Controlled subprocess outcomes; no network, database or verification commands.
function searchWith(outcomes) {
  const source = `
    import cp from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { EventEmitter } from 'node:events';
    const outcomes = ${JSON.stringify(outcomes)};
    const calls = [];
    cp.spawn = (file) => {
      calls.push(file);
      const outcome = outcomes.shift();
      if (!outcome) throw new Error('unexpected fallback');
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      process.nextTick(() => {
        if (outcome.code) child.emit('error', Object.assign(new Error(outcome.code), {code: outcome.code}));
        else {
          if (outcome.stdout) child.stdout.emit('data', Buffer.from(outcome.stdout));
          child.emit('close', outcome.exit, outcome.signal ?? null);
        }
      });
      return child;
    };
    syncBuiltinESMExports();
    const { codeSearch } = await import('./packages/qa/src/tools/repo-search.ts');
    const result = await codeSearch({ repoRoot: process.cwd(), query: 'fixture' });
    console.log(JSON.stringify({calls, result}));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      encoding: 'utf8',
    })
  );
}

test('search preserves operational, invalid-pattern and signal failures', () => {
  for (const outcome of [{ exit: 2 }, { code: 'EACCES' }, { exit: null, signal: 'SIGTERM' }]) {
    const { calls, result } = searchWith([outcome]);
    assert.deepEqual(calls, ['rg']);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.status, 'error');
    assert.doesNotMatch(result.content[0].text, /No matches/);
  }
});

test('search distinguishes matches and genuine no-match results', () => {
  for (const outcome of [{ exit: 0, stdout: 'fixture.ts:1:fixture' }, { exit: 1 }]) {
    const { calls, result } = searchWith([outcome]);
    assert.deepEqual(calls, ['rg']);
    assert.equal(result.structuredContent.status, 'ok');
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, outcome.exit ? /No matches/ : /fixture.ts:1/);
  }
});

test('only missing rg permits git fallback and preserves its failures', () => {
  for (const fallback of [{ exit: 0, stdout: 'fixture.ts:1:fixture' }, { exit: 1 }, { exit: 2 }]) {
    const { calls, result } = searchWith([{ code: 'ENOENT' }, fallback]);
    assert.deepEqual(calls, ['rg', 'git']);
    assert.equal(result.structuredContent.status, fallback.exit === 2 ? 'error' : 'ok');
    assert.equal(result.isError === true, fallback.exit === 2);
  }
});

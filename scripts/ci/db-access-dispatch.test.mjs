import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createDispatch } from './db-access-dispatch.mjs';

function fixture(sources, options) {
  const model = createSourceModel(new Map(Object.entries(sources)));
  const dispatch = createDispatch(
    model,
    {
      isMutated: () => false,
      canonical: () => false,
    },
    options
  );
  const calls = [];
  for (const sf of model.parsed.values())
    model.walk(sf, node => {
      if (ts.isCallExpression(node)) calls.push(node);
    });
  return { model, dispatch, call: text => calls.find(item => item.getText() === text) };
}
test('all two allocation caller alternatives retain distinct body targets in reverse order', () => {
  for (const calls of ['read(a); read(b);', 'read(b); read(a);']) {
    const { dispatch, call } = fixture({
      'apps/web/src/example.ts': `function read(x) { return x.select(); }
        const a = { select(){return 1;} }; const b = { select(){return 2;} }; ${calls}`,
    });
    assert.equal(dispatch.state().settled, true, String([...dispatch.state().reasons]));
    const variants = dispatch.variants(call('x.select()'));
    assert.equal(variants.length, 2);
    assert.ok(variants.every(item => !item.unknown));
    assert.deepEqual(
      new Set(variants.flatMap(item => item.targets.map(target => target.functionNode.getText()))),
      new Set(['select(){return 1;}', 'select(){return 2;}'])
    );
  }
});
test('forwarded callers keep their bound frames instead of open body templates', () => {
  const { dispatch, call } = fixture({
    'apps/web/src/example.ts': `function read(x) { return x.select(); }
      function forward(y) { return read(y); } const a = {select(){return 1;}}; forward(a);`,
  });
  assert.equal(dispatch.state().settled, true, String([...dispatch.state().reasons]));
  const variants = dispatch.variants(call('x.select()'));
  assert.equal(variants.length, 1);
  assert.equal(variants[0].unknown, false, String(variants[0].reasons));
});
test('unknown caller alongside resolved local caller remains an explicit alternative', () => {
  const { dispatch, call } = fixture({
    'apps/web/src/example.ts': `import {getClient} from 'external'; function read(x){return x.select();}
      const a={select(){}}; read(a); read(getClient());`,
  });
  const variants = dispatch.variants(call('x.select()'));
  assert.equal(variants.length, 2);
  assert.ok(variants.some(item => item.unknown));
  assert.ok(variants.some(item => !item.unknown));
});
test('source import reader frames bind caller argument and keep source-local body scope', () => {
  const { dispatch, call } = fixture({
    'apps/web/src/reader.ts':
      'const local={select(){return 9;}}; export function read(x){local.select();return x.select();}',
    'apps/web/src/caller.ts':
      'import {read} from "./reader"; const local={select(){return 1;}}; read(local);',
  });
  const state = dispatch.state();
  assert.equal(state.settled, true, String([...state.reasons]));
  assert.match(
    dispatch.variants(call('x.select()'))[0].targets[0].functionNode.getText(),
    /return 1/
  );
  assert.match(
    dispatch.variants(call('local.select()'))[0].targets[0].functionNode.getText(),
    /return 9/
  );
});
test('opaque callable escape restores unknown binding rather than granting containment exemption', () => {
  const { dispatch, call } = fixture({
    'apps/web/src/example.ts':
      'declare function later(fn: unknown): void; function read(x){return x.select();} const a={select(){}}; read(a); later(read);',
  });
  assert.ok(dispatch.variants(call('x.select()')).some(item => item.unknown));
});
test('iteration and entry bounds remain explicitly unknown', () => {
  for (const options of [{ maxRounds: 1 }, { maxEntries: 1 }]) {
    const { dispatch, call } = fixture(
      {
        'apps/web/src/example.ts':
          'function read(x){return x.select();} const a={select(){}}; read(a);',
      },
      options
    );
    assert.equal(dispatch.state().settled, false);
    assert.equal(dispatch.variants(call('x.select()'))[0].unknown, true);
    assert.ok(
      dispatch.variants(call('x.select()'))[0].reasons.some(reason => /bound/.test(reason))
    );
  }
});

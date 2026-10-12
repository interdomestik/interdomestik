import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import { createLocalInvocations } from './db-access-invocations.mjs';
import { createReferences } from './db-access-references.mjs';

function fixture(reader, caller, { mutated = () => false, escaped = () => false } = {}) {
  const model = createSourceModel(
    new Map([
      ['apps/web/src/reader.ts', reader],
      ['apps/web/src/caller.ts', caller],
    ])
  );
  const refs = createReferences(model, { isMutated: mutated });
  const resolver = createLocalInvocations(model, {
    isMutated: mutated,
    isEscaped: escaped,
    sourceReferences: refs.resolve,
  });
  const calls = [];
  for (const sf of model.parsed.values())
    model.walk(sf, node => {
      if (ts.isCallExpression(node)) calls.push(node);
    });
  return { model, resolver, call: text => calls.find(node => node.getText() === text) };
}
test('direct value import enters exact callee module frame and preserves argument caller frame', () => {
  const { resolver, call } = fixture(
    'const local = { select() { return 9; } }; export function read(x) { local.select(); return x.select(); }',
    'import { read } from "./reader"; const local = { select() { return 1; } }; read(local);'
  );
  const read = resolver.resolveCall(call('read(local)'));
  assert.equal(read.unknown, false, String(read.reasons));
  assert.equal(read.targets.length, 1);
  const target = read.targets[0];
  const receiver = resolver.resolveCall(call('x.select()'), target.context);
  assert.equal(receiver.unknown, false, String(receiver.reasons));
  assert.match(receiver.targets[0].functionNode.getText(), /return 1/);
  const lexical = resolver.resolveCall(call('local.select()'), target.context);
  assert.equal(lexical.unknown, false, String(lexical.reasons));
  assert.match(lexical.targets[0].functionNode.getText(), /return 9/);
});
test('generic standalone route still rejects cross-module binding without explicit source adapter', () => {
  const { model, call } = fixture(
    'export function read(x) { return x; }',
    'import { read } from "./reader"; read({});'
  );
  const resolver = createLocalInvocations(model, {
    isMutated: () => false,
    isEscaped: () => false,
  });
  assert.equal(resolver.resolveCall(call('read({})')).unknown, true);
});
for (const [label, reader, caller, options] of [
  [
    'mutable export',
    'export let read = x => x.select();',
    'import { read } from "./reader"; read({select(){}});',
  ],
  [
    'mutated exported identity',
    'export const read = x => x.select();',
    'import { read } from "./reader"; read({select(){}});',
    { mutated: node => node?.getText() === 'read' },
  ],
  [
    'escaped exported identity',
    'export function read(x){ return x.select(); }',
    'import { read } from "./reader"; read({select(){}});',
    { escaped: node => node?.getText().includes('function read') },
  ],
  [
    'type only',
    'export function read(x) { return x; }',
    'import type { read } from "./reader"; read({});',
  ],
  [
    'missing export',
    'export function other(x) { return x; }',
    'import { read } from "./reader"; read({});',
  ],
  [
    'missing module',
    'export function read(x) { return x; }',
    'import { read } from "./absent"; read({});',
  ],
  [
    'namespace',
    'export function read(x) { return x; }',
    'import * as ns from "./reader"; ns.read({});',
  ],
]) {
  test(`direct import rejects ${label}`, () => {
    const { resolver, call } = fixture(reader, caller, options);
    const text = caller.includes('select')
      ? 'read({select(){}})'
      : caller.includes('ns.read')
        ? 'ns.read({})'
        : 'read({})';
    assert.equal(resolver.resolveCall(call(text)).unknown, true);
  });
}
test('imported async body is callable, its awaited return is not a local factory value', () => {
  const { resolver, call } = fixture(
    'export async function read(x) { return { select() {} }; }',
    'import { read } from "./reader"; read({}); (await read({})).select();'
  );
  assert.equal(resolver.resolveCall(call('read({})')).unknown, false);
  assert.equal(resolver.resolveCall(call('(await read({})).select()')).unknown, true);
});

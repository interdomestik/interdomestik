import ts from 'typescript';
import { isFunction } from './db-access-source.mjs';
import { frameworkEntry } from './db-access-references.mjs';

// Test-named modules are ordinary graph roots when changed and are traversed when production
// imports them. The recognizer only labels production-to-test witnesses; it grants no exemption.
// The three recognizers are kept as separate simple checks; together they match exactly the
// original single alternation. The support suffix is tested on the final path segment's stem.
const TEST_DIRECTORY = /(?:^|\/)__tests__\//u;
const TEST_SUFFIX = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/u;
const SUPPORT_STEM = /[.-](?:fixture|test-support|test-helpers)$/u;

function testSupportSource(file) {
  const base = file.slice(file.lastIndexOf('/') + 1);
  const extension = SOURCE_EXTENSION.exec(base);
  if (!extension) return false;
  return SUPPORT_STEM.test(base.slice(0, extension.index));
}

export const testOnlySource = file =>
  TEST_DIRECTORY.test(file) || TEST_SUFFIX.test(file) || testSupportSource(file);

export function inspectGraphRoots({ model, inventory, origins, references, incomplete, inspect }) {
  // Every changed source is a root, test-named or not: a filename never grants a verdict exemption.
  for (const file of origins ?? inventory.changed) {
    const sf = model.parsed.get(file);
    if (sf.parseDiagnostics.length) {
      incomplete.push({ file, reason: 'parse diagnostics in changed source' });
      continue;
    }
    inspect(sf, file, new Map(), 0);
    if (
      frameworkEntry(file) ||
      sf.statements.some(
        item =>
          ts.isExpressionStatement(item) &&
          ts.isStringLiteral(item.expression) &&
          item.expression.text === 'use server'
      )
    ) {
      for (const exported of model.exportedDeclarations(file)) {
        const resolved = references.resolve(exported);
        if (resolved.unknown) incomplete.push({ file, reason: 'unsupported framework export' });
        for (const fn of resolved.functions) inspect(fn, file, new Map(), 0);
      }
    }
    model.walk(sf, node => {
      if (isFunction(node)) inspect(node, file, new Map(), 0);
    });
  }
}

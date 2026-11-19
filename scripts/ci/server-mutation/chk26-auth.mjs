// CHK-26 identity mechanisms (design §6.2, r5 B8): every element of an identity config's `plugins`
// array and the keys `emailAndPassword` / `socialProviders.<name>`, bound to
// `module#export#configKey` or `module#export#plugin(<resolved factory import>)`.
import ts from 'typescript';

import { functionName, importsOf, isTestFile, lineOf, resolveModule, unwrap } from './ast.mjs';

const AUTH_DIR = 'apps/web/src/lib/auth/';
const KEYS = new Set(['emailAndPassword', 'socialProviders', 'plugins']);

// Object literals reached through conditional spreads (`...(x ? { socialProviders } : {})`).
function spreadObjects(expression) {
  const value = unwrap(expression);
  if (!value) return [];
  if (ts.isObjectLiteralExpression(value)) return [value];
  if (ts.isConditionalExpression(value))
    return [...spreadObjects(value.whenTrue), ...spreadObjects(value.whenFalse)];
  if (ts.isBinaryExpression(value)) return spreadObjects(value.right);
  return [];
}

function factorySource(root, file, sf, call) {
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
  const imported = importsOf(sf).get(call.expression.text);
  if (!imported) return null;
  const resolved = resolveModule(root, file, imported.specifier);
  const module = resolved ? resolved.replace(/(\/index)?\.tsx?$/u, '') : imported.specifier;
  return `${module}#${imported.imported}`;
}

function providerBindings(owner, value, file, line) {
  const providers = value && ts.isObjectLiteralExpression(value) ? value.properties : null;
  if (!providers)
    return [{ binding: `${owner}#socialProviders.?`, file, line, unclassified: true }];
  return providers.map(provider => ({
    binding: `${owner}#socialProviders.${provider.name?.getText() ?? '?'}`,
    file,
    line,
  }));
}

function pluginBindings(ctx, owner, value, line) {
  const { root, file, sf } = ctx;
  const elements = value && ts.isArrayLiteralExpression(value) ? value.elements : null;
  if (!elements) return [{ binding: `${owner}#plugin(?)`, file, line, unclassified: true }];
  return elements.map(element => {
    const source = factorySource(root, file, sf, unwrap(element));
    return {
      binding: `${owner}#plugin(${source ?? '?'})`,
      file,
      line: lineOf(element),
      unclassified: !source,
    };
  });
}

function keyBindings(ctx, owner, property) {
  const key = property.name?.getText();
  if (!KEYS.has(key)) return [];
  const value = ts.isPropertyAssignment(property) ? unwrap(property.initializer) : null;
  const line = lineOf(property);
  if (key === 'emailAndPassword')
    return [{ binding: `${owner}#emailAndPassword`, file: ctx.file, line }];
  if (key === 'socialProviders') return providerBindings(owner, value, ctx.file, line);
  return pluginBindings(ctx, owner, value, line);
}

function detectIn(ctx, object, out) {
  const owner = `${ctx.file}#${functionName(object)}`;
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property))
      for (const inner of spreadObjects(property.expression)) detectIn(ctx, inner, out);
    else out.push(...keyBindings(ctx, owner, property));
  }
}

// A top-level object literal that names an identity key or spreads one in.
function isConfigObject(node) {
  if (!ts.isObjectLiteralExpression(node)) return false;
  if (ts.isSpreadAssignment(node.parent?.parent ?? node)) return false;
  if (ts.isParenthesizedExpression(node.parent) || ts.isConditionalExpression(node.parent))
    return false;
  return node.properties.some(p => KEYS.has(p.name?.getText()) || ts.isSpreadAssignment(p));
}

// Every mechanism detected in the identity configuration sources (tests and test support excluded).
export function detectAuthMechanisms({ root, files, parse }) {
  const out = [];
  for (const file of files) {
    if (!file.startsWith(AUTH_DIR) || isTestFile(file)) continue;
    const sf = parse(file);
    const ctx = { root, file, sf };
    sf.forEachChild(function visit(node) {
      if (isConfigObject(node)) detectIn(ctx, node, out);
      node.forEachChild(visit);
    });
  }
  const seen = new Set();
  return out.filter(item => !seen.has(item.binding) && seen.add(item.binding));
}

export const authBinding = entry => {
  const key = entry.configKey ?? `plugin(${entry.plugin})`;
  return `${entry.module}#${entry.export}#${key}`;
};

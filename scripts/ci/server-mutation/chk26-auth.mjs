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

function detectIn(root, file, sf, object, out) {
  const owner = `${file}#${functionName(object)}`;
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      for (const inner of spreadObjects(property.expression)) detectIn(root, file, sf, inner, out);
      continue;
    }
    const key = property.name?.getText();
    if (!KEYS.has(key)) continue;
    const value = ts.isPropertyAssignment(property) ? unwrap(property.initializer) : null;
    const line = lineOf(property);
    if (key === 'emailAndPassword') out.push({ binding: `${owner}#emailAndPassword`, file, line });
    else if (key === 'socialProviders') {
      const providers = value && ts.isObjectLiteralExpression(value) ? value.properties : null;
      if (!providers)
        out.push({ binding: `${owner}#socialProviders.?`, file, line, unclassified: true });
      for (const provider of providers ?? [])
        out.push({
          binding: `${owner}#socialProviders.${provider.name?.getText() ?? '?'}`,
          file,
          line,
        });
    } else {
      const elements = value && ts.isArrayLiteralExpression(value) ? value.elements : null;
      if (!elements) out.push({ binding: `${owner}#plugin(?)`, file, line, unclassified: true });
      for (const element of elements ?? []) {
        const source = factorySource(root, file, sf, unwrap(element));
        out.push({
          binding: `${owner}#plugin(${source ?? '?'})`,
          file,
          line: lineOf(element),
          unclassified: !source,
        });
      }
    }
  }
}

// Every mechanism detected in the identity configuration sources (tests and test support excluded).
export function detectAuthMechanisms({ root, files, parse }) {
  const out = [];
  for (const file of files) {
    if (!file.startsWith(AUTH_DIR) || isTestFile(file)) continue;
    const sf = parse(file);
    sf.forEachChild(function visit(node) {
      if (
        ts.isObjectLiteralExpression(node) &&
        !ts.isSpreadAssignment(node.parent?.parent ?? node)
      ) {
        const nested =
          ts.isParenthesizedExpression(node.parent) || ts.isConditionalExpression(node.parent);
        if (
          !nested &&
          node.properties.some(p => KEYS.has(p.name?.getText()) || ts.isSpreadAssignment(p))
        )
          detectIn(root, file, sf, node, out);
      }
      node.forEachChild(visit);
    });
  }
  const seen = new Set();
  return out.filter(item => !seen.has(item.binding) && seen.add(item.binding));
}

export const authBinding = entry =>
  `${entry.module}#${entry.export}#${entry.configKey ?? `plugin(${entry.plugin})`}`;

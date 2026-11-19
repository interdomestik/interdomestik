// CHK-05b (design §6.4, as r2): a response body is parsed, never cast. Reports a type assertion to
// anything but `unknown` whose operand (through parentheses, await, `.catch(...)`, `as unknown` and
// const bindings) is a `.json()` call. Non-test source.
import ts from 'typescript';

import { functionName, isTestFile, lineOf, shortHash, textOf } from './ast.mjs';
import { lookup } from './chk05-provenance.mjs';

const isAssertion = node => ts.isAsExpression(node) || ts.isTypeAssertionExpression(node);
const isUnknown = node => node.type.kind === ts.SyntaxKind.UnknownKeyword;

function stripToSource(expression, depth = 0) {
  let node = expression;
  for (;;) {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAwaitExpression(node) ||
      ts.isNonNullExpression(node)
    )
      node = node.expression;
    else if (isAssertion(node) && isUnknown(node)) node = node.expression;
    else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'catch'
    )
      node = node.expression.expression;
    else break;
  }
  if (ts.isIdentifier(node) && depth < 8) {
    const binding = lookup(node);
    if (binding?.kind === 'const' && !binding.key && binding.decl.initializer)
      return stripToSource(binding.decl.initializer, depth + 1);
  }
  return node;
}

const isJsonCall = node =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === 'json' &&
  node.arguments.length === 0;

export const CHK05B = {
  id: 'CHK-05b',
  multiset: true,
  sources: ['ast.mjs', 'chk05-provenance.mjs', 'chk05b.mjs'],
  needsRegistry: false,
  run({ files, parse }) {
    const findings = [];
    let units = 0;
    for (const file of files) {
      if (isTestFile(file)) continue;
      parse(file).forEachChild(function visit(node) {
        node.forEachChild(visit);
        if (!isAssertion(node) || isUnknown(node)) return;
        if (isAssertion(node.parent) && !isUnknown(node.parent)) return; // judged at the outer assertion
        units += 1;
        if (!isJsonCall(stripToSource(node.expression))) return;
        findings.push({
          id: `${file}#${functionName(node)}#${shortHash(textOf(node))}`,
          file,
          line: lineOf(node),
          message: 'a .json() body is cast instead of parsed',
        });
      });
    }
    return { units, findings };
  },
};

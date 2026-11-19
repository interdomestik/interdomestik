// UNAUTH-TEXT (design §6.4, r3 H1): a refusal is a typed error with a code, never an
// `Error('…unauthorized…')` that a text match would have to classify. Exempt only when the next
// statement assigns the binding's `code` a literal refusal code. Dynamic rethrows that can carry
// such a text are listed apart, report-only.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  ScanError,
  functionName,
  isTestFile,
  isUseClientModule,
  lineOf,
  shortHash,
  textOf,
  unwrap,
} from './ast.mjs';

const TYPES = 'apps/web/src/lib/safe-action.types.ts';
const TEXT_RE = /unauthorized/iu;
const DYNAMIC_RE = /^(String\([\w.]+\.error\)|[\w.]+\.(error|message))$/u;

// REFUSAL_CODES as the wrapper declares them, read from its source.
export function refusalCodes(root) {
  const file = path.join(root, TYPES);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const match = /export const REFUSAL_CODES = Object\.freeze\(\[([^\]]*)\]/u.exec(text);
  const codes = match ? [...match[1].matchAll(/'([A-Z_]+)'/gu)].map(m => m[1]) : [];
  if (!codes.length) throw new ScanError(`REFUSAL_CODES not found in ${TYPES}`);
  return new Set(codes);
}

const literalText = node =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : ts.isTemplateExpression(node ?? {})
      ? node.getText()
      : null;

function exempt(newError, codes) {
  const decl = newError.parent;
  if (!ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name)) return false;
  const statement = decl.parent.parent;
  const block = statement.parent;
  const next = block?.statements?.[block.statements.indexOf(statement) + 1];
  const expression = next && ts.isExpressionStatement(next) ? next.expression : null;
  if (
    !expression ||
    !ts.isBinaryExpression(expression) ||
    expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
  )
    return false;
  const target = expression.left;
  const value = unwrap(expression.right);
  const receiver = ts.isPropertyAccessExpression(target) ? unwrap(target.expression) : null;
  return (
    target.name?.text === 'code' &&
    Boolean(receiver) &&
    ts.isIdentifier(receiver) &&
    receiver.text === decl.name.text &&
    ts.isStringLiteral(value) &&
    codes.has(value.text)
  );
}

export const UNAUTH_TEXT = {
  id: 'UNAUTH-TEXT',
  multiset: true,
  sources: ['ast.mjs', 'unauth-text.mjs'],
  needsRegistry: false,
  run({ root, files, parse }) {
    const codes = refusalCodes(root);
    const findings = [];
    const reportOnly = [];
    let units = 0;
    for (const file of files) {
      if (isTestFile(file)) continue;
      const sf = parse(file);
      if (isUseClientModule(sf)) continue;
      sf.forEachChild(function visit(node) {
        node.forEachChild(visit);
        if (!ts.isNewExpression(node) || textOf(node.expression) !== 'Error') return;
        units += 1;
        const first = node.arguments?.[0];
        const text = literalText(first);
        const where = { file, line: lineOf(node) };
        if (text !== null && TEXT_RE.test(text) && !exempt(node, codes))
          findings.push({
            id: `${file}#${functionName(node)}#${shortHash(textOf(node))}`,
            ...where,
            message: 'refusal thrown as an untyped Error text',
          });
        else if (first && text === null && DYNAMIC_RE.test(textOf(first)))
          reportOnly.push({
            id: `${file}#${functionName(node)}#${shortHash(textOf(node))}`,
            ...where,
            message: 'dynamic rethrow (report only)',
          });
      });
    }
    return { units, findings, reportOnly };
  },
};

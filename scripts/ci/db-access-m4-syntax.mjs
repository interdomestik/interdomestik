// Internal finite M4 kernel derivation. No runtime admission authority.
import { createHash } from 'node:crypto';
import ts from 'typescript';

export function failM4Source(reason) {
  throw new Error(`m4 kernel source rejected: ${reason}`);
}

export function expect(condition, reason) {
  if (!condition) failM4Source(reason);
}

export function canonicalJson(item) {
  if (Array.isArray(item)) return `[${item.map(canonicalJson).join(',')}]`;
  if (item && typeof item === 'object')
    return `{${Object.keys(item)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(item[key])}`)
      .join(',')}}`;
  return JSON.stringify(item);
}

export const same = (left, right) => canonicalJson(left) === canonicalJson(right);

export const byCanonical = (left, right) => {
  const [a, b] = [canonicalJson(left), canonicalJson(right)];
  return a < b ? -1 : a > b ? 1 : 0;
};

export const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

export const literal = text => `literal:${JSON.stringify(text)}`;

export const failure = text => ({ success: 'literal:false', error: literal(text) });

export const allOf = (...operands) => ({ and: operands.sort(byCanonical) });

export const modifierKinds = node => [...(node.modifiers ?? [])].map(modifier => modifier.kind);

export function deepFreeze(item) {
  if (item && typeof item === 'object' && !Object.isFrozen(item)) {
    Object.freeze(item);
    for (const child of Object.values(item)) deepFreeze(child);
  }
  return item;
}

export function parseKernel(sourceText) {
  const fileName = '/m4-kernel/ops-assignment.ts';
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS
  );
  // Single-file program without lib or module resolution: only syntactic diagnostics are read.
  const host = {
    getSourceFile: name => (name === fileName ? sourceFile : undefined),
    getDefaultLibFileName: () => '/m4-kernel/lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/m4-kernel',
    getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: name => name === fileName,
    readFile: () => undefined,
  };
  const program = ts.createProgram({
    rootNames: [fileName],
    options: { noLib: true, noResolve: true, types: [] },
    host,
  });
  expect(
    program.getSyntacticDiagnostics(sourceFile).length === 0,
    'source does not parse as TypeScript'
  );
  return sourceFile;
}

export function canon(node) {
  const children = [];
  ts.forEachChild(node, child => {
    children.push(canon(child));
  });
  const text =
    ts.isIdentifier(node) || ts.isLiteralExpression(node) ? JSON.stringify(node.text) : '';
  const operator = 'operator' in node ? `:${node.operator}` : '';
  return `${node.kind}${text}${operator}(${children.join(',')})`;
}

export function reviewedType(text) {
  const file = ts.createSourceFile(
    '/m4-kernel/reviewed-type.ts',
    `type Reviewed = ${text};`,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS
  );
  return canon(file.statements[0].type);
}

export function declare(scope, name, descriptor, label) {
  expect(
    !scope.locals.has(name) && !scope.unit.names.has(name) && name !== 'Date',
    `${label}: binding ${name} shadows or redeclares a binding`
  );
  scope.locals.set(name, descriptor);
}

// CHK-04 (design §6.1): every server action is a literal wrapper definition; every route method is
// a registered machine entry; inline 'use server' functions are never compliant; nothing outside
// its test imports the public intake path.
import ts from 'typescript';

import { importsOf, isUseServerModule, lineOf, resolveModule, unwrap } from './ast.mjs';
import { findTest } from './chk26-tests.mjs';
import { collectUnits } from './units.mjs';

const WRAPPER_MODULE = 'apps/web/src/lib/safe-action.ts';
const FACTORIES = new Set(['defineAction', 'defineFormAction']);
const PUBLIC_MODULE = 'apps/web/src/lib/safe-action.public.ts';
const PUBLIC_TEST = 'apps/web/src/lib/safe-action.public.test.ts';
const isStringLiteral = node =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));

// Own properties of a literal object with no spread, no computed key and no duplicate key.
export function literalProperties(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) return { error: 'not an object literal' };
  const props = new Map();
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) return { error: 'spread element' };
    if (!property.name || ts.isComputedPropertyName(property.name))
      return { error: 'computed key' };
    const key = property.name.text ?? property.name.getText();
    if (props.has(key)) return { error: `duplicate key ${key}` };
    props.set(key, ts.isPropertyAssignment(property) ? unwrap(property.initializer) : property);
  }
  return { props };
}

function definitionCall(root, target) {
  const decl = target?.decl;
  if (!decl || !ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name)) return null;
  if (!(decl.parent.flags & ts.NodeFlags.Const)) return null;
  const call = unwrap(decl.initializer);
  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
  const sf = decl.getSourceFile();
  const imported = importsOf(sf).get(call.expression.text);
  if (!imported || !FACTORIES.has(imported.imported)) return null;
  if (resolveModule(root, target.file, imported.specifier) !== WRAPPER_MODULE) return null;
  return isUseServerModule(sf) ? call : null;
}

// Why a definition is not compliant, or null; `name` is returned for the uniqueness pass.
function definitionProblem(call) {
  const { props, error } = literalProperties(unwrap(call.arguments[0]));
  if (error) return { problem: `definition: ${error}` };
  for (const key of ['name', 'basis', 'input', 'subject', 'handler'])
    if (!props.has(key)) return { problem: `definition has no own ${key}` };
  if (!isStringLiteral(props.get('name'))) return { problem: 'name is not a string literal' };
  const basis = literalProperties(props.get('basis'));
  if (basis.error) return { problem: `basis: ${basis.error}` };
  const kind = basis.props.get('kind');
  if (!isStringLiteral(kind)) return { problem: 'basis.kind is not a string literal' };
  if (kind.text === 'public' && !isStringLiteral(basis.props.get('entry')))
    return { problem: 'basis.entry is not a string literal' };
  const subject = literalProperties(props.get('subject'));
  if (subject.error) return { problem: `subject: ${subject.error}` };
  if (!isStringLiteral(subject.props.get('type')))
    return { problem: 'subject.type is not a string literal' };
  return { name: props.get('name').text, kind: kind.text, entry: basis.props.get('entry')?.text };
}

// Splits the server-action units into literal definitions and non-compliant units.
export function analyseDefinitions(root, actions) {
  const definitions = [];
  const problems = [];
  for (const unit of actions) {
    const call = definitionCall(root, unit.target);
    const result = call ? definitionProblem(call) : { problem: 'not a literal wrapper definition' };
    if (result.problem) problems.push({ id: unit.id, file: unit.file, message: result.problem });
    else definitions.push({ unit, ...result });
  }
  return { definitions, problems };
}

export const publicDefinitions = (root, actions) =>
  analyseDefinitions(root, actions).definitions.filter(def => def.kind === 'public');

function publicBinding(registry, unit, entry, name) {
  const row = registry.entries.find(candidate => candidate.id === entry);
  if (!row || row.kind !== 'server-action' || row.operation !== name) return false;
  const binding = `${unit.file}#${unit.name}`;
  return `${row.module}#${row.export}` === binding || (row.aliases ?? []).includes(binding);
}

// Compliant (c): a route entry for exactly this file and method whose denied test exists by title.
function routeRegistered(registry, unit, parse) {
  return registry.entries.some(row => {
    if (row.kind !== 'route' || row.module !== unit.file || row.method !== unit.method)
      return false;
    const sf = parse(row.deniedTest.path);
    return Boolean(sf) && Boolean(findTest(sf, row.deniedTest.title));
  });
}

function publicIntakeImporters(root, files, parse) {
  const out = [];
  for (const file of files) {
    if (!file.startsWith('apps/web/src/') || file === PUBLIC_MODULE || file === PUBLIC_TEST)
      continue;
    const sf = parse(file);
    for (const statement of sf.statements) {
      const spec = statement.moduleSpecifier?.text;
      if (
        spec &&
        resolveModule(root, file, spec) === PUBLIC_MODULE &&
        /runPublicIntake|\*/u.test(statement.getText())
      )
        out.push({
          id: `${file}#imports-runPublicIntake`,
          file,
          line: lineOf(statement),
          message: 'imports runPublicIntake',
        });
    }
  }
  return out;
}

export const CHK04 = {
  id: 'CHK-04',
  sources: ['ast.mjs', 'units.mjs', 'registry.mjs', 'chk04.mjs', 'chk26-tests.mjs'],
  needsRegistry: true,
  run({ root, files, parse, registry }) {
    const { actions, inline, routes } = collectUnits({ root, files, parse });
    const { definitions, problems: findings } = analyseDefinitions(root, actions);
    // One definition exposed under several aliases is one name owner, not a duplicate.
    const owners = new Map();
    for (const def of definitions) {
      const decls = owners.get(def.name) ?? new Set();
      decls.add(def.unit.target.decl);
      owners.set(def.name, decls);
    }
    for (const def of definitions) {
      if (owners.get(def.name).size > 1)
        findings.push({
          id: def.unit.id,
          file: def.unit.file,
          message: `duplicate name ${def.name}`,
        });
      else if (def.kind === 'public' && !publicBinding(registry, def.unit, def.entry, def.name))
        findings.push({
          id: def.unit.id,
          file: def.unit.file,
          message: 'public definition not bound by the registry',
        });
    }
    for (const unit of inline)
      findings.push({ id: unit.id, file: unit.file, message: "inline 'use server' function" });
    for (const unit of routes)
      if (!routeRegistered(registry, unit, parse))
        findings.push({
          id: unit.id,
          file: unit.file,
          message: 'route method is not a registered machine entry',
        });
    findings.push(...publicIntakeImporters(root, files, parse));
    return { units: { export: actions.length, route: routes.length }, findings };
  },
};

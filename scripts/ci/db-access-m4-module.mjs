// Internal finite M4 kernel derivation. No runtime admission authority.
import ts from 'typescript';
import {
  expect,
  failM4Source,
  same,
  literal,
  modifierKinds,
  canon,
  reviewedType,
  declare,
} from './db-access-m4-syntax.mjs';
import { IMPORTS, CONSTANTS, TYPE_ALIASES, FUNCTIONS, EXPORT } from './db-access-m4-spec.mjs';

export function bind(unit, name, descriptor) {
  expect(
    !unit.names.has(name) && name !== 'Date',
    `binding ${name} is declared twice or shadows a binding`
  );
  unit.names.add(name);
  if (descriptor) unit.values.set(name, descriptor);
}

export function readImport(statement, unit) {
  const from = ts.isStringLiteral(statement.moduleSpecifier)
    ? statement.moduleSpecifier.text
    : null;
  expect(
    from !== null && Object.hasOwn(IMPORTS, from),
    `unreviewed import ${from ?? '<non-literal>'}`
  );
  const clause = statement.importClause;
  expect(
    !statement.modifiers?.length &&
      !statement.attributes &&
      clause &&
      !clause.isTypeOnly &&
      !clause.name &&
      clause.namedBindings &&
      ts.isNamedImports(clause.namedBindings),
    `import ${from}: only plain named imports are reviewed`
  );
  expect(!unit.imported.has(from), `import ${from}: duplicate import`);
  unit.imported.add(from);
  const reviewed = IMPORTS[from];
  const names = [];
  for (const element of clause.namedBindings.elements) {
    const name = element.name.text;
    const typeOnly = element.isTypeOnly;
    expect(
      !element.propertyName && Object.hasOwn(reviewed, name) && reviewed[name] === typeOnly,
      `import ${from}: binding ${name} is not reviewed in this form`
    );
    bind(unit, name, typeOnly ? null : `${from}#${name}`);
    unit.imports.push(`${typeOnly ? 'type ' : ''}${from}#${name}`);
    names.push(name);
  }
  expect(
    same(names.sort(), Object.keys(reviewed).sort()),
    `import ${from}: reviewed bindings missing`
  );
}

export function readConstant(statement, unit) {
  const { declarations, flags } = statement.declarationList;
  expect(
    (flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const && declarations.length === 1,
    'top level: only single const declarations are reviewed'
  );
  const [declaration] = declarations;
  const name = ts.isIdentifier(declaration.name) ? declaration.name.text : null;
  expect(
    name && Object.hasOwn(CONSTANTS, name),
    `unreviewed top-level binding ${name ?? '<pattern>'}`
  );
  const { exported, value: expected } = CONSTANTS[name];
  expect(
    !declaration.type &&
      !declaration.exclamationToken &&
      declaration.initializer &&
      ts.isStringLiteral(declaration.initializer) &&
      declaration.initializer.text === expected &&
      same(modifierKinds(statement), exported ? [EXPORT] : []),
    `constant ${name}: value or export changed`
  );
  bind(unit, name, literal(expected));
}

export function readTypeAlias(statement, unit) {
  const name = statement.name.text;
  expect(Object.hasOwn(TYPE_ALIASES, name), `unreviewed type alias ${name}`);
  const { exported, type } = TYPE_ALIASES[name];
  expect(
    !statement.typeParameters &&
      same(modifierKinds(statement), exported ? [EXPORT] : []) &&
      canon(statement.type) === reviewedType(type),
    `type ${name}: reviewed public/kernel type changed`
  );
  bind(unit, name, null);
}

export function readFunction(statement, unit) {
  const name = statement.name?.text;
  expect(
    name && Object.hasOwn(FUNCTIONS, name),
    `unreviewed top-level function ${name ?? '<anonymous>'}`
  );
  const spec = FUNCTIONS[name];
  expect(
    !statement.asteriskToken && !statement.typeParameters && statement.body,
    `${name}: unreviewed function form`
  );
  expect(same(modifierKinds(statement), spec.modifiers), `${name}: export/async modifiers changed`);
  expect(statement.parameters.length === spec.params.length, `${name}: parameter list changed`);
  spec.params.forEach(([parameterName, type], position) => {
    const parameter = statement.parameters[position];
    expect(
      ts.isIdentifier(parameter.name) &&
        parameter.name.text === parameterName &&
        !parameter.dotDotDotToken &&
        !parameter.questionToken &&
        !parameter.initializer &&
        !parameter.modifiers?.length &&
        parameter.type &&
        canon(parameter.type) === reviewedType(type),
      `${name}: parameter ${position + 1} must be ${parameterName}: ${type} with no default or rest`
    );
  });
  expect(
    (statement.type ? canon(statement.type) : null) ===
      (spec.returns && reviewedType(spec.returns)),
    `${name}: return type changed`
  );
  bind(unit, name, `function:${name}`);
  unit.functions.set(name, statement);
}

export function readModule(sourceFile) {
  const unit = {
    names: new Set(),
    values: new Map(),
    imported: new Set(),
    imports: [],
    functions: new Map(),
    guard: null,
  };
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) readImport(statement, unit);
    else if (ts.isVariableStatement(statement)) readConstant(statement, unit);
    else if (ts.isTypeAliasDeclaration(statement)) readTypeAlias(statement, unit);
    else if (ts.isFunctionDeclaration(statement)) readFunction(statement, unit);
    else failM4Source(`unaccounted top-level statement ${ts.SyntaxKind[statement.kind]}`);
  }
  for (const from of Object.keys(IMPORTS))
    expect(unit.imported.has(from), `reviewed import ${from} missing`);
  for (const name of [
    ...Object.keys(CONSTANTS),
    ...Object.keys(TYPE_ALIASES),
    ...Object.keys(FUNCTIONS),
  ])
    expect(unit.names.has(name), `reviewed declaration ${name} missing`);
  return unit;
}

export function enterFunction(name, unit) {
  const scope = { unit, locals: new Map() };
  for (const [parameter, , descriptor] of FUNCTIONS[name].params)
    declare(scope, parameter, descriptor, name);
  return { scope, statements: [...unit.functions.get(name).body.statements] };
}

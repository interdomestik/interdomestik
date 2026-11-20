// CHK-05 (design §6.3): what reaches a Drizzle write. Every spread needs parsed provenance, an
// unresolvable write value needs it itself, and no spread may follow an identity key. Ids carry the
// structural path from the function root, by construct identity (r5/r6 B8).
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  functionName,
  isTestFile,
  isUseClientModule,
  lineOf,
  listSourceFiles,
  shortHash,
  textOf,
  unwrap,
} from './ast.mjs';
import { lookup, provenanceProblem } from './chk05-provenance.mjs';
import { createSchemaResolver } from './chk05-schema.mjs';
import { createExportResolver } from './units.mjs';

const TENANT_KEYS = ['tenantId', 'accessTenantId'];
const OWNER_REF_RE = /\.references\(\s*\(\)\s*=>\s*(user|tenants)\.id\b/u;

// Identity keys: tenant keys plus every schema property whose column references user.id or tenants.id.
export function identityKeys(root) {
  const keys = new Set(TENANT_KEYS);
  for (const file of listSourceFiles(root, ['packages/database/src/schema'])) {
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    sf.forEachChild(function visit(node) {
      if (ts.isPropertyAssignment(node) && OWNER_REF_RE.test(node.initializer.getText()))
        keys.add(node.name.getText());
      node.forEachChild(visit);
    });
  }
  return keys;
}

function chainCalls(call) {
  const names = [];
  for (let node = call.expression; node;) {
    if (ts.isPropertyAccessExpression(node)) node = node.expression;
    else if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression))
        names.push({ name: node.expression.name.text, call: node });
      node = node.expression;
    } else break;
  }
  return names;
}

// Drizzle writes: .values(arg) / .set(arg) after .insert( / .update(, and onConflictDoUpdate({ set }).
// An upsert config is read only as an inline object literal whose members are plain: its `set` key
// matched by name, quoted or not; any other config is a write with an unresolved config, never
// followed through bindings (Astra r9 B32).
function writeOf(call) {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const method = call.expression.name.text;
  const chain = chainCalls(call);
  const root = chain.find(link => link.name === 'insert' || link.name === 'update');
  if (!root) return null;
  const table = textOf(root.call.arguments[0] ?? root.call);
  if (method === 'values' && root.name === 'insert')
    return { op: 'insert', table, arg: call.arguments[0] };
  if (method === 'set' && root.name === 'update')
    return { op: 'update', table, arg: call.arguments[0] };
  if (method === 'onConflictDoUpdate') return upsertOf(call, table);
  return null;
}

const PLAIN_MEMBER = p => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p);

function upsertOf(call, table) {
  const config = unwrap(call.arguments[0]);
  const members = config && ts.isObjectLiteralExpression(config) ? config.properties : null;
  const keys = members?.every(PLAIN_MEMBER) ? members.map(p => propertyKey(p.name)) : ['?'];
  // A computed key may be `set`; a second `set` replaces the first at run time.
  if (keys.includes('?') || keys.filter(key => key === 'set').length > 1)
    return { op: 'upsert', table, arg: config ?? call, configProblem: true };
  const set = members.find(p => propertyKey(p.name) === 'set');
  if (!set) return null;
  return { op: 'upsert', table, arg: ts.isPropertyAssignment(set) ? set.initializer : set.name };
}

// Follows identifiers through const bindings to object literals; arrays give every element.
function resolveObjects(expression, depth = 0) {
  const value = unwrap(expression);
  if (!value || depth > 8) return { unresolved: [expression] };
  if (ts.isObjectLiteralExpression(value)) return { objects: [value] };
  if (ts.isArrayLiteralExpression(value)) {
    const parts = value.elements.map(element => resolveObjects(element, depth + 1));
    return {
      objects: parts.flatMap(p => p.objects ?? []),
      unresolved: parts.flatMap(p => p.unresolved ?? []),
    };
  }
  if (ts.isIdentifier(value)) {
    const binding = lookup(value);
    if (binding?.kind === 'const' && !binding.key && binding.decl.initializer) {
      const inner = unwrap(binding.decl.initializer);
      if (
        ts.isObjectLiteralExpression(inner) ||
        ts.isArrayLiteralExpression(inner) ||
        ts.isIdentifier(inner)
      )
        return resolveObjects(inner, depth + 1);
    }
  }
  return { unresolved: [value] };
}

const LOOPS = new Set([
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
]);
const isCallback = node =>
  ts.isFunctionLike(node) && Boolean(node.parent) && ts.isCallExpression(node.parent);
const isRootFunction = node =>
  ts.isFunctionDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && !isCallback(node));

const switchOf = clause => shortHash(textOf(clause.parent.parent.expression));
function loopHeader(node) {
  const text = textOf(node);
  return shortHash(text.slice(0, text.indexOf(textOf(node.statement))));
}

// A construct's identity, independent of its position among siblings (r5 B8, r6).
function constructLabel(node) {
  if (ts.isIfStatement(node)) return `if(${shortHash(textOf(node.expression))})`;
  if (ts.isTryStatement(node)) return 'try';
  if (ts.isCaseClause(node))
    return `switch(${switchOf(node)}).case(${shortHash(textOf(node.expression))})`;
  if (ts.isDefaultClause(node)) return `switch(${switchOf(node)}).default`;
  if (LOOPS.has(node.kind)) return `loop(${loopHeader(node)})`;
  if (isCallback(node))
    return `cb(${shortHash(textOf(node.parent.expression))})#${node.parent.arguments.indexOf(node)}`;
  return null;
}

function branchOf(node, child) {
  if (ts.isIfStatement(node)) return child === node.elseStatement ? '.else' : '.then';
  if (ts.isTryStatement(node)) {
    if (child === node.tryBlock) return '.block';
    return child === node.finallyBlock ? '.finally' : '.catch';
  }
  return '';
}

// Constructs at the same level as `node`: statements of its container, or callbacks of calls at
// the same block level.
function siblingsOf(node) {
  const container = node.parent;
  if (ts.isCaseBlock(container)) return container.clauses;
  if (!isCallback(node)) return container.statements ?? [];
  let block = container;
  while (block && !ts.isBlock(block) && !ts.isSourceFile(block)) block = block.parent;
  const out = [];
  block?.forEachChild(function visit(child) {
    if (isCallback(child)) out.push(child);
    if (!ts.isBlock(child) && !ts.isFunctionLike(child)) child.forEachChild(visit);
    else if (ts.isFunctionLike(child)) return;
  });
  return out;
}

function structuralPath(call) {
  const parts = [];
  let ambiguous = false;
  let child = call;
  for (let node = call.parent; node && !ts.isSourceFile(node); child = node, node = node.parent) {
    const label = constructLabel(node);
    if (label) {
      parts.unshift(label + branchOf(node, child));
      if (
        siblingsOf(node).some(
          other => other !== node && other.kind === node.kind && constructLabel(other) === label
        )
      )
        ambiguous = true;
    }
    if (isRootFunction(node)) break;
  }
  return { path: parts.join('/') || 'body', ambiguous };
}

function spreadProblems(property, ctx, identitySeen) {
  const problems = identitySeen ? [`spread after identity key ${identitySeen}`] : [];
  const problem = provenanceProblem(property.expression, ctx);
  if (problem) problems.push(`spread ${textOf(property.expression).slice(0, 40)}: ${problem}`);
  return problems;
}

// The key a property name denotes: `tenantId`, 'tenantId' and ['tenantId'] are the same key.
function propertyKey(name) {
  if (!name) return '?';
  const literal = ts.isComputedPropertyName(name) ? unwrap(name.expression) : name;
  if (ts.isIdentifier(literal) && !ts.isComputedPropertyName(name)) return literal.text;
  return ts.isStringLiteralLike(literal) || ts.isNumericLiteral(literal) ? literal.text : '?';
}

function analyseObject(object, ctx, keys) {
  const problems = [];
  const lines = [];
  const order = [];
  let identitySeen = null;
  for (const property of object.properties) {
    if (!ts.isSpreadAssignment(property)) {
      const key = property.name?.getText() ?? '?';
      order.push(key);
      const name = propertyKey(property.name);
      if (keys.has(name) && !identitySeen) identitySeen = name;
      continue;
    }
    order.push(`...${textOf(property.expression)}`);
    const found = spreadProblems(property, ctx, identitySeen);
    problems.push(...found);
    if (found.length) lines.push(lineOf(property));
  }
  return { problems, order, lines };
}

// The finding of one write, or null when every value has parsed provenance. An upsert config that
// is not an inline literal of plain members is one unresolved value, never followed (r9 B32).
const CONFIG_PROBLEM = 'onConflictDoUpdate config is not an inline object literal';
function writeFinding(node, write, ctx, keys) {
  const { objects = [], unresolved = [] } = write.configProblem
    ? { unresolved: [write.arg] }
    : resolveObjects(write.arg);
  const problems = [];
  const lines = [];
  for (const value of unresolved) {
    const problem = write.configProblem ? CONFIG_PROBLEM : provenanceProblem(value, ctx);
    if (!problem) continue;
    problems.push(`write value ${textOf(value).slice(0, 40)}: ${problem}`);
    lines.push(lineOf(value));
  }
  const order = [];
  for (const object of objects) {
    const result = analyseObject(object, ctx, keys);
    problems.push(...result.problems);
    lines.push(...result.lines);
    order.push(result.order.join(','));
  }
  if (!problems.length) return null;
  const { path: where, ambiguous } = structuralPath(node);
  const content = shortHash([...order, ...unresolved.map(textOf)].join('|'));
  const id = `${ctx.file}#${functionName(node)}#${where}#${write.op}(${write.table})#${content}`;
  return {
    id: ambiguous ? `ambiguous:${id}` : id,
    file: ctx.file,
    line: Math.min(...lines),
    message: problems.join('; '),
    ambiguous,
  };
}

export const CHK05 = {
  id: 'CHK-05',
  multiset: true,
  sources: ['ast.mjs', 'units.mjs', 'chk05.mjs', 'chk05-schema.mjs', 'chk05-provenance.mjs'],
  needsRegistry: false,
  run({ root, files, parse }) {
    const keys = identityKeys(root);
    const resolveSchema = createSchemaResolver(root, parse, createExportResolver(root, parse));
    const findings = [];
    let units = 0;
    for (const file of files) {
      if (isTestFile(file)) continue;
      const sf = parse(file);
      if (isUseClientModule(sf)) continue;
      const ctx = { root, file, resolveSchema };
      sf.forEachChild(function visit(node) {
        node.forEachChild(visit);
        const write = ts.isCallExpression(node) && writeOf(node);
        if (!write) return;
        units += 1;
        const finding = writeFinding(node, write, ctx, keys);
        if (finding) findings.push(finding);
      });
    }
    return { units, findings };
  },
};

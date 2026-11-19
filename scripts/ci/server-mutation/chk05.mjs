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
  if (method === 'onConflictDoUpdate') {
    const config = unwrap(call.arguments[0]);
    const set =
      config &&
      ts.isObjectLiteralExpression(config) &&
      config.properties.find(p => p.name?.getText() === 'set');
    if (set)
      return {
        op: 'upsert',
        table,
        arg: ts.isPropertyAssignment(set) ? set.initializer : set.name,
      };
  }
  return null;
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

function analyseObject(object, ctx, keys) {
  const problems = [];
  const lines = [];
  const order = [];
  let identitySeen = null;
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      order.push(`...${textOf(property.expression)}`);
      const before = problems.length;
      if (identitySeen) problems.push(`spread after identity key ${identitySeen}`);
      const problem = provenanceProblem(property.expression, ctx);
      if (problem) problems.push(`spread ${textOf(property.expression).slice(0, 40)}: ${problem}`);
      if (problems.length > before) lines.push(lineOf(property));
    } else {
      const key = property.name?.getText() ?? '?';
      order.push(key);
      if (keys.has(key) && !identitySeen) identitySeen = key;
    }
  }
  return { problems, order, lines };
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
        const { objects = [], unresolved = [] } = resolveObjects(write.arg);
        const problems = [];
        const lines = [];
        for (const value of unresolved) {
          const problem = provenanceProblem(value, ctx);
          if (problem) problems.push(`write value ${textOf(value).slice(0, 40)}: ${problem}`);
          if (problem) lines.push(lineOf(value));
        }
        const order = [];
        for (const object of objects) {
          const result = analyseObject(object, ctx, keys);
          problems.push(...result.problems);
          lines.push(...result.lines);
          order.push(result.order.join(','));
        }
        if (!problems.length) return;
        const { path: where, ambiguous } = structuralPath(node);
        const content = shortHash([...order, ...unresolved.map(textOf)].join('|'));
        const id = `${file}#${functionName(node)}#${where}#${write.op}(${write.table})#${content}`;
        const line = Math.min(...lines);
        findings.push({
          id: ambiguous ? `ambiguous:${id}` : id,
          file,
          line,
          message: problems.join('; '),
          ambiguous,
        });
      });
    }
    return { units, findings };
  },
};

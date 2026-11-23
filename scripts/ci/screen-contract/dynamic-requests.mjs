// The module requests D-1 does not model (the WP-05 flip, D-1): non-literal `import()` and
// `require`, `createRequire` in every form, the CommonJS `module`, AMD `define`, `import.meta.<x>`
// and `new X(…, import.meta.url)`. `dynamicRequest` names the node whose source text the reviewed
// exceptions (requests.mjs) compare. Split from specifiers-edges.mjs, unchanged.

export const literalOf = node => {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0].value.cooked;
  return null;
};

// A member of `module`: `'require'` for `module.require` or `module['require']` (r6, r7), which
// webpack also records as a CommonJS dependency when called with a literal; `'unknown'` for a
// computed member whose name is not a literal (`module[k]`); else null.
export function moduleMember(node) {
  if (node?.type !== 'MemberExpression' || node.object?.type !== 'Identifier') return null;
  if (node.object.name !== 'module') return null;
  let name = null;
  if (node.computed) name = literalOf(node.property);
  else if (node.property.type === 'Identifier') name = node.property.name;
  if (name === null) return node.computed ? 'unknown' : null;
  return name === 'require' ? 'require' : null;
}
export const isModuleRequire = callee => moduleMember(callee) === 'require';

export const isIdentifier = (node, name) => node?.type === 'Identifier' && node.name === name;
const isImportMeta = node =>
  node?.type === 'MetaProperty' && node.meta.name === 'import' && node.property.name === 'meta';
const isImportMetaUrl = node =>
  node?.type === 'MemberExpression' &&
  isImportMeta(node.object) &&
  !node.computed &&
  isIdentifier(node.property, 'url');

const BARE_REQUIRE_OK = (node, parent) => {
  switch (parent?.type) {
    case 'CallExpression':
      return parent.callee === node;
    case 'MemberExpression':
      return parent.object === node || (parent.property === node && !parent.computed);
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
    case 'TSPropertySignature':
      return parent.key === node && !parent.computed;
    case 'VariableDeclarator':
      return parent.id === node;
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return parent.id === node || parent.params.includes(node);
    case 'TSTypeQuery':
    case 'TSQualifiedName':
      return true;
    default:
      return false;
  }
};

// A declaration the compiled code keeps: not ambient (`declare …`, inside a `declare module`,
// `declare namespace` or `declare global` block, an overload signature) and not a type-only
// import, which the emit erases (Sol r2). A plain `namespace` counts as kept (Sol r3); one that holds
// only types is erased by the emit, which this check does not tell apart: a named limit (MODULE.md,
// "Also named limits").
function isAmbient(node) {
  for (let at = node; at; at = at.parent)
    if (at.declare === true || at.type === 'TSDeclareFunction') return true;
  return false;
}
const isRuntimeDef = def =>
  def.type !== 'Type' &&
  !(
    def.type === 'ImportBinding' &&
    (def.parent?.importKind === 'type' || def.node?.importKind === 'type')
  ) &&
  !isAmbient(def.node);

// The identifiers that name the free CommonJS `module`: no runtime declaration in scope (a
// configured global has none either). A local binding named `module` (`import * as module`, a
// parameter) is not it (Sol r1); an ambient or type-only one is (Sol r2). Without a scope manager
// every `module` counts as free (fail closed).
export function freeModuleIdentifiers(origin) {
  const manager = origin?.sourceCode?.scopeManager;
  if (!manager) return null;
  const out = new Set();
  for (const scope of manager.scopes)
    for (const ref of scope.references)
      if (ref.identifier.name === 'module' && !(ref.resolved?.defs ?? []).some(isRuntimeDef))
        out.add(ref.identifier);
  return out;
}

// A module request that is not a literal specifier (resolution.mjs, `REVIEWED_DYNAMIC_REQUESTS`):
// the node whose source text names it, or null. `parent` is the node's parent; `isFreeModule`
// tells whether a `module` identifier is the CommonJS one.
const hasOneLiteralArgument = call =>
  call?.arguments.length === 1 && literalOf(call.arguments[0]) !== null;
const isDirectCall = (node, parent) => parent?.type === 'CallExpression' && parent.callee === node;
const isCreateRequireName = (node, computed = false) =>
  (!computed && isIdentifier(node, 'createRequire')) || literalOf(node) === 'createRequire';
const aliasesCreateRequire = (from, to) => isCreateRequireName(from) && !isCreateRequireName(to);

function callRequest(node) {
  const { callee } = node;
  if (isIdentifier(callee, 'require')) return hasOneLiteralArgument(node) ? null : node;
  if (isIdentifier(callee, 'define') || isIdentifier(callee, 'createRequire')) return node;
  // Keep checking an identifier named `createRequire` in either member syntax on a call.
  if (callee.type === 'MemberExpression' && isCreateRequireName(callee.property)) return node;
  return null;
}

function memberRequest(node, parent, isFreeModule) {
  if (isIdentifier(node.object, 'require')) return node;
  if (isCreateRequireName(node.property, node.computed) && !isDirectCall(node, parent)) return node;
  // `module[k]` with a computed name, and `module.require` other than called with one literal
  // (`const r = module.require`, r7: also `module['require']`).
  if (isFreeModule(node.object)) {
    if (moduleMember(node) === 'unknown') return node;
    if (isModuleRequire(node))
      return isDirectCall(node, parent) && hasOneLiteralArgument(parent) ? null : node;
  }
  if (isImportMeta(node.object) && !isImportMetaUrl(node)) return node;
  return null;
}

function createRequirePropertyRequest(node, parent) {
  if (parent?.type === 'ObjectPattern') {
    const aliased =
      isCreateRequireName(node.key, node.computed) && !isIdentifier(node.value, 'createRequire');
    return aliased ? node : null;
  }
  return isIdentifier(node.value, 'createRequire') ? node.value : null;
}

function createRequireIdentifierRequest(node, parent) {
  switch (parent?.type) {
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'ExportSpecifier':
    case 'TSImportEqualsDeclaration':
    case 'TSTypeReference':
    case 'ArrayPattern':
    case 'RestElement':
      return null;
    case 'AssignmentPattern':
      return parent.left === node ? null : node;
    case 'MemberExpression':
      return parent.property === node && !parent.computed ? null : node;
    case 'Property':
      // The property check distinguishes a destructuring binding from an object value.
      if (parent.value === node) return null;
      break;
    default:
      break;
  }
  return BARE_REQUIRE_OK(node, parent) ? null : node;
}

function importEqualsRequest(node) {
  if (node.importKind === 'type') return null;
  let reference = node.moduleReference;
  while (reference.type === 'TSQualifiedName') {
    if (isIdentifier(reference.right, 'createRequire')) return node;
    reference = reference.left;
  }
  return isIdentifier(reference, 'createRequire') ? node : null;
}

function identifierRequest(node, parent, isFreeModule) {
  if (isIdentifier(node, 'createRequire')) return createRequireIdentifierRequest(node, parent);
  // A bare `require` that is neither called, nor a member's object or name, nor a declared name or
  // type query (`const r = require` is refused; `declare function require` is not a request).
  if (isIdentifier(node, 'require')) return BARE_REQUIRE_OK(node, parent) ? null : node;
  // r7: a bare `module` read as a value can carry its `require` elsewhere (`const m = module`,
  // `const { require: r } = module`); a member's object, a declared name or a type query is not.
  if (isIdentifier(node, 'module') && isFreeModule(node)) {
    const typeofRead = parent?.type === 'UnaryExpression' && parent.operator === 'typeof';
    return typeofRead || BARE_REQUIRE_OK(node, parent) ? null : node;
  }
  return null;
}

export function dynamicRequest(node, parent, isFreeModule) {
  switch (node.type) {
    case 'ImportSpecifier':
      return aliasesCreateRequire(node.imported, node.local) ? node : null;
    case 'ExportSpecifier':
      return aliasesCreateRequire(node.local, node.exported) ? node : null;
    case 'Property':
      return createRequirePropertyRequest(node, parent);
    case 'TSImportEqualsDeclaration':
      return importEqualsRequest(node);
    case 'ImportExpression':
      return literalOf(node.source) === null ? node : null;
    case 'CallExpression':
      return callRequest(node);
    case 'MemberExpression':
      return memberRequest(node, parent, isFreeModule);
    case 'NewExpression':
      return node.arguments.some(isImportMetaUrl) ? node : null;
    case 'Identifier':
      return identifierRequest(node, parent, isFreeModule);
    default:
      return null;
  }
}

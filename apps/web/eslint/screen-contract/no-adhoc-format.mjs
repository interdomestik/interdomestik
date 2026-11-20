// CHK-09, first part (R-09, R-23f): a screen formats dates, numbers and money only through the
// shared helpers (design §2; B7, B13, B19). It flags calls, never imports.
import { fileOf, report, rule, unitCounter } from './common.mjs';

const TO_LOCALE = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']);
const TO_DIGITS = new Set(['toFixed', 'toPrecision']);
const INTL = new Set(['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'DurationFormat']);
const NEXT_INTL_FORMAT = new Set(['dateTime', 'dateTimeRange', 'relativeTime', 'number']);
const HUMAN_ATTRIBUTES = new Set([
  'title',
  'alt',
  'placeholder',
  'label',
  'aria-label',
  'aria-valuetext',
  'aria-description',
]);
const DATE_FNS_RE = /^date-fns(?:-tz)?(?:\/(.+))?$/u;
const NEXT_INTL_RE = /^next-intl(?:\/server)?$/u;

const isFormatName = name =>
  /^(?:format|intlFormat|lightFormat)/u.test(name) && !/^format(?:ISO|RFC)/u.test(name);
const nameOf = node => (node?.type === 'Identifier' ? node.name : null);
const propertyOf = member =>
  member?.type === 'MemberExpression' && !member.computed ? nameOf(member.property) : null;
const literalOf = node =>
  node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
const unwrapAwait = node => (node?.type === 'AwaitExpression' ? node.argument : node);
const requiredModule = init => {
  const call = unwrapAwait(init);
  return call?.type === 'CallExpression' && nameOf(call.callee) === 'require'
    ? literalOf(call.arguments[0])
    : null;
};

// The date-fns module a direct load names: `require('date-fns')`, `await import('date-fns/format')`.
function loadedDateFns(node) {
  const load = unwrapAwait(node);
  let source = null;
  if (load?.type === 'CallExpression' && nameOf(load.callee) === 'require')
    source = literalOf(load.arguments[0]);
  else if (load?.type === 'ImportExpression') source = literalOf(load.source);
  return source === null ? null : DATE_FNS_RE.exec(source);
}

function isIntlObject(node) {
  if (nameOf(node) === 'Intl') return true;
  return propertyOf(node) === 'Intl' && ['globalThis', 'window'].includes(nameOf(node.object));
}

const PASS_THROUGH = {
  BinaryExpression: (parent, node) => parent.operator === '+',
  TemplateLiteral: () => true,
  LogicalExpression: parent => parent.operator === '??' || parent.operator === '||',
  ConditionalExpression: (parent, node) => parent.test !== node,
  ChainExpression: () => true,
  TSAsExpression: () => true,
  TSNonNullExpression: () => true,
};

export default rule('A screen formats only through the shared helpers (CHK-09)', context => {
  const { rel, role } = fileOf(context);
  if (role !== 'screen') return {};
  const units = unitCounter(context, 'CHK-09');
  const dateFnsFunctions = new Map(); // local -> imported format name
  const dateFnsNamespaces = new Set();
  const formatterFactories = new Set();
  const formatters = new Set();
  const formatterMethods = new Map(); // local -> next-intl method
  const translatorFactories = new Set();
  const translators = new Set(['t']);
  const calls = [];
  const flag = (node, callee) =>
    report(
      context,
      node,
      `CHK-09|${rel}|${callee}`,
      `${callee} formats by hand; use the shared helpers`
    );

  const isTranslator = callee => {
    if (nameOf(callee) && translators.has(callee.name)) return true;
    const method = propertyOf(callee);
    return (method === 'rich' || method === 'markup') && translators.has(nameOf(callee.object));
  };

  // The walk of design §2 (B19): up through `+`, templates, `??`/`||` and conditional branches;
  // flagged when it ends in a JSX child, a human-read attribute or a `t(…)` interpolation value.
  function inDisplayPosition(call) {
    let node = call;
    let parent = node.parent;
    while (parent && PASS_THROUGH[parent.type]?.(parent, node)) {
      node = parent;
      parent = parent.parent;
    }
    if (parent?.type === 'JSXExpressionContainer') {
      const holder = parent.parent;
      if (holder.type === 'JSXElement' || holder.type === 'JSXFragment') return true;
      if (holder.type === 'JSXAttribute') return HUMAN_ATTRIBUTES.has(holder.name?.name);
      return false;
    }
    if (parent?.type === 'Property' && parent.value === node) {
      const object = parent.parent;
      const call2 = object.parent;
      return (
        object.type === 'ObjectExpression' &&
        call2?.type === 'CallExpression' &&
        call2.arguments[1] === object &&
        isTranslator(call2.callee)
      );
    }
    return false;
  }

  function bindDateFns(local, imported, subpath) {
    const name = imported ?? subpath?.split('/').pop() ?? null;
    if (name && isFormatName(name)) dateFnsFunctions.set(local, name);
  }

  // A format call on a load that is not bound first (r1 H4): `require('date-fns').format(…)`,
  // `require('date-fns/format')(…)`, `useFormatter().number(…)`.
  function directFormat(callee, method) {
    if (method && isFormatName(method) && loadedDateFns(callee.object)) return `date-fns.${method}`;
    const subpath = loadedDateFns(callee)?.[1];
    const name = subpath?.split('/').pop();
    if (name && isFormatName(name)) return `date-fns.${name}`;
    const factory = unwrapAwait(callee.object);
    if (
      method &&
      NEXT_INTL_FORMAT.has(method) &&
      factory?.type === 'CallExpression' &&
      formatterFactories.has(nameOf(factory.callee))
    )
      return `next-intl.${method}`;
    return null;
  }

  // A call of a formatter bound earlier in the file: date-fns functions or namespaces, next-intl
  // formatters or their destructured methods.
  function boundFormat(callee, method) {
    const name = nameOf(callee);
    if (name && dateFnsFunctions.has(name)) return `date-fns.${dateFnsFunctions.get(name)}`;
    if (name && formatterMethods.has(name)) return `next-intl.${formatterMethods.get(name)}`;
    if (!method) return null;
    const object = nameOf(callee.object);
    if (isFormatName(method) && dateFnsNamespaces.has(object)) return `date-fns.${method}`;
    if (NEXT_INTL_FORMAT.has(method) && formatters.has(object)) return `next-intl.${method}`;
    return null;
  }

  function checkCall(node) {
    units.add('call');
    const { callee } = node;
    const method = propertyOf(callee);
    if (method && TO_LOCALE.has(method)) return flag(node, method);
    if (method && TO_DIGITS.has(method)) return inDisplayPosition(node) && flag(node, method);
    if (method && INTL.has(method) && isIntlObject(callee.object))
      return flag(node, `Intl.${method}`);
    const formatted = directFormat(callee, method) ?? boundFormat(callee, method);
    return formatted ? flag(node, formatted) : undefined;
  }

  function bindDateFnsImport(spec, subpath) {
    const local = spec.local.name;
    if (spec.type === 'ImportNamespaceSpecifier') dateFnsNamespaces.add(local);
    else if (spec.type === 'ImportDefaultSpecifier') bindDateFns(local, null, subpath);
    else bindDateFns(local, spec.imported.name ?? spec.imported.value);
  }

  function bindNextIntlImport(spec) {
    const local = spec.local.name;
    const imported = spec.imported.name ?? spec.imported.value;
    if (imported === 'useFormatter' || imported === 'getFormatter') formatterFactories.add(local);
    if (imported === 'useTranslations' || imported === 'getTranslations')
      translatorFactories.add(local);
  }

  // `const x = require('date-fns/…')`, `const { format } = require('date-fns')`.
  function bindRequiredDateFns(id, subpath) {
    if (id.type === 'Identifier') {
      if (subpath) bindDateFns(id.name, null, subpath);
      else dateFnsNamespaces.add(id.name);
    } else if (id.type === 'ObjectPattern')
      for (const p of id.properties)
        if (p.type === 'Property' && nameOf(p.key) && nameOf(p.value))
          bindDateFns(p.value.name, p.key.name);
  }

  // `const format = useFormatter()`, `const { dateTime } = await getFormatter()`.
  function bindFormatter(id) {
    if (id.type === 'Identifier') formatters.add(id.name);
    else if (id.type === 'ObjectPattern')
      for (const p of id.properties)
        if (p.type === 'Property' && NEXT_INTL_FORMAT.has(nameOf(p.key)) && nameOf(p.value))
          formatterMethods.set(p.value.name, p.key.name);
  }

  return {
    Program() {
      units.add('file');
    },
    ImportDeclaration(node) {
      const source = node.source.value;
      const dateFns = DATE_FNS_RE.exec(source);
      for (const spec of node.specifiers) {
        if (dateFns) bindDateFnsImport(spec, dateFns[1]);
        else if (NEXT_INTL_RE.test(source) && spec.type === 'ImportSpecifier')
          bindNextIntlImport(spec);
      }
    },
    VariableDeclarator(node) {
      const init = unwrapAwait(node.init);
      const required = requiredModule(node.init);
      const dateFns = required === null ? null : DATE_FNS_RE.exec(required);
      if (dateFns) {
        bindRequiredDateFns(node.id, dateFns[1]);
        return;
      }
      const factory = init?.type === 'CallExpression' ? nameOf(init.callee) : null;
      if (factory && formatterFactories.has(factory)) bindFormatter(node.id);
      if (factory && translatorFactories.has(factory) && node.id.type === 'Identifier')
        translators.add(node.id.name);
    },
    // Calls are judged at the end, once every binding of the file is known.
    CallExpression: node => calls.push(node),
    NewExpression: node => calls.push(node),
    'Program:exit'(program) {
      calls.forEach(checkCall);
      units.flush(program);
    },
  };
});

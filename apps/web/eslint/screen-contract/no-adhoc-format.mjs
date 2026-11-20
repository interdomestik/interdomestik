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

  function checkCall(node) {
    units.add('call');
    const { callee } = node;
    const method = propertyOf(callee);
    if (method && TO_LOCALE.has(method)) return flag(node, method);
    if (method && TO_DIGITS.has(method)) return inDisplayPosition(node) && flag(node, method);
    if (method && INTL.has(method) && isIntlObject(callee.object))
      return flag(node, `Intl.${method}`);
    if (nameOf(callee) && dateFnsFunctions.has(callee.name))
      return flag(node, `date-fns.${dateFnsFunctions.get(callee.name)}`);
    if (method && isFormatName(method) && dateFnsNamespaces.has(nameOf(callee.object)))
      return flag(node, `date-fns.${method}`);
    if (method && NEXT_INTL_FORMAT.has(method) && formatters.has(nameOf(callee.object)))
      return flag(node, `next-intl.${method}`);
    if (nameOf(callee) && formatterMethods.has(callee.name))
      return flag(node, `next-intl.${formatterMethods.get(callee.name)}`);
    return undefined;
  }

  return {
    Program() {
      units.add('file');
    },
    ImportDeclaration(node) {
      const source = node.source.value;
      const dateFns = DATE_FNS_RE.exec(source);
      for (const spec of node.specifiers) {
        const local = spec.local.name;
        if (dateFns) {
          if (spec.type === 'ImportNamespaceSpecifier') dateFnsNamespaces.add(local);
          else if (spec.type === 'ImportDefaultSpecifier') bindDateFns(local, null, dateFns[1]);
          else bindDateFns(local, spec.imported.name ?? spec.imported.value);
        } else if (NEXT_INTL_RE.test(source) && spec.type === 'ImportSpecifier') {
          const imported = spec.imported.name ?? spec.imported.value;
          if (imported === 'useFormatter' || imported === 'getFormatter')
            formatterFactories.add(local);
          if (imported === 'useTranslations' || imported === 'getTranslations')
            translatorFactories.add(local);
        }
      }
    },
    VariableDeclarator(node) {
      const init = unwrapAwait(node.init);
      const required = requiredModule(node.init);
      const dateFns = required === null ? null : DATE_FNS_RE.exec(required);
      if (dateFns) {
        if (node.id.type === 'Identifier') {
          if (dateFns[1]) bindDateFns(node.id.name, null, dateFns[1]);
          else dateFnsNamespaces.add(node.id.name);
        } else if (node.id.type === 'ObjectPattern')
          for (const p of node.id.properties)
            if (p.type === 'Property' && nameOf(p.key) && nameOf(p.value))
              bindDateFns(p.value.name, p.key.name);
        return;
      }
      const factory = init?.type === 'CallExpression' ? nameOf(init.callee) : null;
      if (factory && formatterFactories.has(factory)) {
        if (node.id.type === 'Identifier') formatters.add(node.id.name);
        else if (node.id.type === 'ObjectPattern')
          for (const p of node.id.properties)
            if (p.type === 'Property' && NEXT_INTL_FORMAT.has(nameOf(p.key)) && nameOf(p.value))
              formatterMethods.set(p.value.name, p.key.name);
      }
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

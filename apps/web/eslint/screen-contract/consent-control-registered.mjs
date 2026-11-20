// CHK-22 (R-23e): a consent control is registered, each use of it sits in a marked submission
// boundary, and the boundary invokes the registered submission (WP-05 design §2.1; B3, B11, B16,
// B20, and the post-r5 formAction rule).
import fs from 'node:fs';
import path from 'node:path';

import { ScanError } from '../../../../scripts/ci/server-mutation/ast.mjs';
import { catalogueFor, messageText } from '../../../../scripts/ci/screen-contract/catalogue.mjs';
import { originOf } from '../../../../scripts/ci/screen-contract/origins.mjs';
import { registryFor } from '../../../../scripts/ci/screen-contract/registry.mjs';
import { layerOf } from '../../../../scripts/ci/screen-contract/roles.mjs';
import { kindOfSpecifier } from '../../../../scripts/ci/screen-contract/specifiers.mjs';
import { fileOf, report, resolverOf, rule, unitCounter } from './common.mjs';

const VOCABULARY_RE =
  /consent|terms|privacy|gdpr|agree|accept[\w.-]*(?:terms|polic)|marketing|newsletter|opt-?in/iu;
const CONTROL_COMPONENTS = new Set(['Checkbox', 'Switch', 'RadioGroupItem']);
const CHOICE_TYPES = new Set(['checkbox', 'radio']);
const STRING_ATTRIBUTES = ['id', 'name', 'value', 'aria-label', 'data-testid'];
const HANDLER_ATTRIBUTES = ['checked', 'onCheckedChange', 'onChange'];
const FORMS = new Set(['form', 'Form']);
const LABELS = new Set(['label', 'Label']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const TRANSLATOR_FACTORIES = new Set(['useTranslations', 'getTranslations']);

const elementName = opening => (opening?.name?.type === 'JSXIdentifier' ? opening.name.name : null);
const attributeOf = (opening, name) =>
  opening.attributes.find(a => a.type === 'JSXAttribute' && a.name?.name === name) ?? null;

function literalAttribute(opening, name) {
  const value = attributeOf(opening, name)?.value;
  if (value?.type === 'Literal' && typeof value.value === 'string') return value.value;
  const expression = value?.type === 'JSXExpressionContainer' ? value.expression : null;
  if (expression?.type === 'Literal' && typeof expression.value === 'string')
    return expression.value;
  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0)
    return expression.quasis[0].value.cooked;
  return null;
}

const expressionOf = attribute =>
  attribute?.value?.type === 'JSXExpressionContainer' ? attribute.value.expression : null;

function walk(node, visit, keys) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of keys[node.type] ?? []) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach(c => walk(c, visit, keys));
    else walk(child, visit, keys);
  }
}

// The local name a translator call goes through: `t('k')` or `t.rich('k')`.
function calleeLocal(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier')
    return callee.object.name;
  return null;
}

function importedName(spec) {
  if (spec.type === 'ImportDefaultSpecifier') return 'default';
  if (spec.type === 'ImportNamespaceSpecifier') return '*';
  return spec.imported.name ?? spec.imported.value;
}

// The namespace argument of `useTranslations(ns)` / `getTranslations({ namespace })`.
function translatorNamespace(arg) {
  if (arg?.type === 'Literal' && typeof arg.value === 'string') return arg.value;
  if (arg?.type === 'ObjectExpression')
    return arg.properties.find(p => p.key?.name === 'namespace')?.value?.value ?? '';
  return '';
}

function isControl(opening) {
  const name = elementName(opening);
  if (CONTROL_COMPONENTS.has(name)) return true;
  return name === 'input' && CHOICE_TYPES.has(literalAttribute(opening, 'type'));
}

// The nearest enclosing form within the same component, or null.
function enclosingForm(element) {
  for (let current = element.parent; current; current = current.parent) {
    if (FUNCTIONS.has(current.type)) return null;
    if (current.type === 'JSXElement' && FORMS.has(elementName(current.openingElement)))
      return current;
  }
  return null;
}

function enclosingLabel(element) {
  for (let current = element.parent; current; current = current.parent) {
    if (FUNCTIONS.has(current.type)) return null;
    if (current.type === 'JSXElement' && LABELS.has(elementName(current.openingElement)))
      return current;
  }
  return null;
}

export default rule('A consent control is registered and tested (CHK-22)', context => {
  const { root, rel, role } = fileOf(context);
  const inInventory =
    role === 'screen' || (role === 'support' && rel.startsWith('packages/ui/src/'));
  if (!inInventory) return {};
  const keys = context.sourceCode.visitorKeys;
  const units = unitCounter(context, 'CHK-22');
  const imports = new Map(); // local -> { specifier, imported }
  const translators = new Map(); // local -> namespace
  const elements = []; // every JSXElement
  const functions = new Map(); // name -> function node (top level of the file, one level)
  const flag = (node, kind, key, text) =>
    report(context, node, `CHK-22|${rel}|${kind}|${key}`, text);

  // Literal message keys of every translator call under `node`, with their full dotted key.
  function messageKeys(node) {
    const out = [];
    walk(
      node,
      n => {
        if (n.type !== 'CallExpression') return;
        const local = calleeLocal(n.callee);
        if (!local || !translators.has(local)) return;
        const arg = n.arguments[0];
        if (arg?.type !== 'Literal' || typeof arg.value !== 'string') return;
        const ns = translators.get(local);
        out.push(ns ? `${ns}.${arg.value}` : arg.value);
      },
      keys
    );
    return out;
  }

  function labelTexts(node) {
    const out = [];
    walk(node, n => n.type === 'JSXText' && out.push(n.value), keys);
    return out;
  }

  function vocabularyHit(element, byId) {
    const opening = element.openingElement;
    const words = [];
    for (const name of STRING_ATTRIBUTES) words.push(literalAttribute(opening, name) ?? '');
    for (const name of HANDLER_ATTRIBUTES)
      walk(
        expressionOf(attributeOf(opening, name)),
        n => {
          if (n.type === 'Identifier') words.push(n.name);
        },
        keys
      );
    const labels = [];
    const enclosing = enclosingLabel(element);
    if (enclosing) labels.push(enclosing);
    const id = literalAttribute(opening, 'id');
    if (id) labels.push(...(byId.labelsFor.get(id) ?? []));
    const labelledBy = literalAttribute(opening, 'aria-labelledby');
    if (labelledBy) labels.push(...(byId.elements.get(labelledBy) ?? []));
    const labelProp = attributeOf(opening, 'label');
    if (labelProp) labels.push(labelProp);
    const labelLiteral = literalAttribute(opening, 'label');
    if (labelLiteral) words.push(labelLiteral);
    const catalogue = labels.length ? catalogueFor(root) : null;
    for (const label of labels) {
      words.push(...labelTexts(label));
      for (const key of messageKeys(label)) {
        const text = messageText(catalogue, key);
        if (text === null)
          throw new ScanError(`${rel}: the label key ${key} is not in the English catalogue`);
        words.push(key, text);
      }
    }
    return words.some(word => VOCABULARY_RE.test(word));
  }

  // `${file}#${export}` of a local identifier bound to an import, or null.
  function submissionOfIdentifier(name) {
    const binding = imports.get(name);
    if (!binding || kindOfSpecifier(binding.specifier) === 'external') return null;
    const origin = originOf(resolverOf(context), rel, binding.specifier, binding.imported);
    return origin.external || origin.unresolved ? null : origin;
  }

  const isServerOrigin = origin =>
    layerOf(origin.file, fs.readFileSync(path.join(root, origin.file), 'utf8')) === 2;

  // The one submission a handler calls: an import of a layer-2 module, followed one level by name.
  function submissionOfHandler(expression) {
    let body = expression;
    if (expression?.type === 'Identifier') body = functions.get(expression.name) ?? null;
    if (!body || !(FUNCTIONS.has(body.type) || body.type === 'CallExpression')) return null;
    const found = new Map();
    walk(
      body,
      n => {
        if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier') return;
        const origin = submissionOfIdentifier(n.callee.name);
        if (origin && isServerOrigin(origin)) found.set(`${origin.file}#${origin.name}`, origin);
      },
      keys
    );
    return found.size === 1 ? [...found.keys()][0] : null;
  }

  // The submission named by the form's `action`, else by its `onSubmit` handler, or null.
  function primaryFormSubmission(opening) {
    const action = expressionOf(attributeOf(opening, 'action'));
    if (action) {
      const origin = action.type === 'Identifier' ? submissionOfIdentifier(action.name) : null;
      return origin ? `${origin.file}#${origin.name}` : null;
    }
    const onSubmit = expressionOf(attributeOf(opening, 'onSubmit'));
    return onSubmit ? submissionOfHandler(onSubmit) : null;
  }

  // The submissions of every `formAction` inside the form, or null when one cannot be resolved.
  function formActionSubmissions(boundary) {
    const out = [];
    let unresolved = false;
    walk(
      boundary,
      n => {
        if (n.type !== 'JSXOpeningElement') return;
        const formAction = attributeOf(n, 'formAction');
        if (!formAction) return;
        const expression = expressionOf(formAction);
        const origin =
          expression?.type === 'Identifier' ? submissionOfIdentifier(expression.name) : null;
        if (origin) out.push(`${origin.file}#${origin.name}`);
        else unresolved = true;
      },
      keys
    );
    return unresolved ? null : out;
  }

  function handlerSubmissions(opening) {
    for (const name of ['onCheckedChange', 'onChange']) {
      const handler = expressionOf(attributeOf(opening, name));
      if (handler) {
        const resolved = submissionOfHandler(handler);
        return resolved ? [resolved] : null;
      }
    }
    return null;
  }

  // Every submission the boundary invokes, or null when one of them cannot be resolved.
  function invokedSubmissions(boundary, isForm) {
    if (!isForm) return handlerSubmissions(boundary.openingElement);
    const primary = primaryFormSubmission(boundary.openingElement);
    if (!primary) return null;
    const formActions = formActionSubmissions(boundary);
    return formActions ? [primary, ...formActions] : null;
  }

  // The entries an element renders through an imported component (§2.1 "Renders").
  function renderedEntries(element, registry) {
    const name = elementName(element.openingElement);
    const binding = name ? imports.get(name) : null;
    if (!binding || kindOfSpecifier(binding.specifier) === 'external') return [];
    const origin = originOf(resolverOf(context), rel, binding.specifier, binding.imported);
    const out = [];
    for (const entry of registry.values()) {
      if (!entry.exportName || entry.kind === 'not-consent') continue;
      const targets = [{ file: entry.file, exportName: entry.exportName }, ...entry.aliases];
      if (!targets.some(t => t.file === origin.file && t.exportName === origin.name)) continue;
      if (entry.aliases.some(a => a.file === rel)) continue;
      if (entry.selfSubmitting && rel !== entry.file) continue;
      out.push(entry);
    }
    return out;
  }

  function indexById() {
    const byId = { labelsFor: new Map(), elements: new Map() };
    for (const element of elements) {
      const opening = element.openingElement;
      const id = literalAttribute(opening, 'id');
      if (id) byId.elements.set(id, [...(byId.elements.get(id) ?? []), element]);
      const target = LABELS.has(elementName(opening)) ? literalAttribute(opening, 'htmlFor') : null;
      if (target) byId.labelsFor.set(target, [...(byId.labelsFor.get(target) ?? []), element]);
    }
    return byId;
  }

  // Counts a control and flags it when it reads as consent without `data-consent`; true if flagged.
  function flagUnregistered(element, consentId, byId) {
    const opening = element.openingElement;
    if (!isControl(opening)) return false;
    units.add('control');
    if (consentId || !vocabularyHit(element, byId)) return false;
    const key =
      literalAttribute(opening, 'id') ??
      literalAttribute(opening, 'name') ??
      literalAttribute(opening, 'data-testid') ??
      '?';
    flag(
      element,
      'unregistered',
      `${elementName(opening)}:${key}`,
      'consent control without data-consent'
    );
    return true;
  }

  // The registry entries the element renders: its own `data-consent` use, or the entries of
  // the imported component it renders. A misbound `data-consent` is flagged and renders none.
  function elementRenders(element, consentId, registry) {
    if (!consentId) return renderedEntries(element, registry);
    const opening = element.openingElement;
    const entry = registry.get(consentId);
    const control = literalAttribute(opening, 'id') ?? literalAttribute(opening, 'name');
    if (!entry || entry.file !== rel || entry.control !== control) {
      flag(element, 'misbound', consentId, `data-consent ${consentId} is not this file's control`);
      return [];
    }
    const isDefinition = entry.exportName && !entry.selfSubmitting;
    return !isDefinition && entry.kind !== 'not-consent' ? [entry] : [];
  }

  function analyse(program) {
    const registry = registryFor(root);
    const byId = indexById();
    const renders = []; // { element, entry }
    for (const element of elements) {
      const consentId = literalAttribute(element.openingElement, 'data-consent');
      if (flagUnregistered(element, consentId, byId)) continue;
      for (const entry of elementRenders(element, consentId, registry))
        renders.push({ element, entry });
    }
    judgeBoundaries(renders, registry);
    units.flush(program);
  }

  function boundariesOf(renders) {
    const boundaries = new Map(); // node -> { isForm, entries:Set }
    for (const { element, entry } of renders) {
      const form = enclosingForm(element);
      const node = form ?? element;
      if (!boundaries.has(node))
        boundaries.set(node, { isForm: Boolean(form), entries: new Set() });
      boundaries.get(node).entries.add(entry.id);
    }
    return boundaries;
  }

  // The boundary's listed uses that are this file's, counting each in `listedTimes`.
  function validUses(node, entries, registry, listedTimes) {
    const tokens = (literalAttribute(node.openingElement, 'data-consent-use') ?? '')
      .split(/\s+/u)
      .filter(Boolean);
    const valid = [];
    for (const token of tokens) {
      const [entryId, useId, extra] = token.split(':');
      const use = registry.get(entryId)?.uses.find(u => u.useId === useId);
      if (extra !== undefined || !use || use.file !== rel) {
        flag(
          node,
          'unmatched-boundary',
          token,
          `listed use ${token} is unknown or not this file's`
        );
        continue;
      }
      listedTimes.set(token, (listedTimes.get(token) ?? 0) + 1);
      if (!entries.has(entryId))
        flag(node, 'orphan-use', token, `${token} has no render in this boundary`);
      valid.push({ token, use });
    }
    return valid;
  }

  function judgeSubmission(node, isForm, valid) {
    const invoked = invokedSubmissions(node, isForm);
    if (!invoked) {
      flag(
        node,
        'unresolved-submission',
        valid.map(v => v.token).join(' '),
        'the submission cannot be resolved here'
      );
      return;
    }
    for (const { token, use } of valid)
      if (invoked.some(submission => submission !== use.submission))
        flag(
          node,
          'submission-mismatch',
          token,
          `invokes ${invoked.join(', ')}, registered ${use.submission}`
        );
  }

  function judgeBoundary(node, { isForm, entries }, registry, listedTimes) {
    units.add('boundary');
    const valid = validUses(node, entries, registry, listedTimes);
    for (const entryId of entries)
      if (!valid.some(v => v.token.startsWith(`${entryId}:`)))
        flag(node, 'unmatched-boundary', entryId, `the boundary does not list a use of ${entryId}`);
    if (valid.length) judgeSubmission(node, isForm, valid);
  }

  function flagListing(listedTimes, registry) {
    for (const [token, times] of listedTimes)
      if (times > 1)
        flag(
          context.sourceCode.ast,
          'shared-use',
          token,
          `${token} is listed by ${times} boundaries`
        );
    for (const entry of registry.values())
      for (const use of entry.uses) {
        const token = `${entry.id}:${use.useId}`;
        if (use.file === rel && !listedTimes.has(token))
          flag(
            context.sourceCode.ast,
            'orphan-use',
            token,
            `${token} is listed by no boundary here`
          );
      }
  }

  function judgeBoundaries(renders, registry) {
    const listedTimes = new Map();
    for (const [node, boundary] of boundariesOf(renders))
      judgeBoundary(node, boundary, registry, listedTimes);
    flagListing(listedTimes, registry);
  }

  // `const t = useTranslations(ns)` / `const t = await getTranslations(...)` from next-intl.
  function recordTranslator(node, init) {
    if (
      init?.type !== 'CallExpression' ||
      init.callee.type !== 'Identifier' ||
      node.id.type !== 'Identifier'
    )
      return;
    const binding = imports.get(init.callee.name);
    if (
      binding &&
      /^next-intl(?:\/server)?$/u.test(binding.specifier) &&
      TRANSLATOR_FACTORIES.has(binding.imported)
    )
      translators.set(node.id.name, translatorNamespace(init.arguments[0]));
  }

  return {
    ImportDeclaration(node) {
      for (const spec of node.specifiers)
        imports.set(spec.local.name, {
          specifier: node.source.value,
          imported: importedName(spec),
        });
    },
    VariableDeclarator(node) {
      const init = node.init?.type === 'AwaitExpression' ? node.init.argument : node.init;
      recordTranslator(node, init);
      if (node.id.type === 'Identifier' && FUNCTIONS.has(node.init?.type))
        functions.set(node.id.name, node.init);
      // `const onSubmit = useCallback(fn, deps)`: the wrapped function, one level.
      if (
        node.id.type === 'Identifier' &&
        init?.type === 'CallExpression' &&
        FUNCTIONS.has(init.arguments[0]?.type)
      )
        functions.set(node.id.name, init.arguments[0]);
    },
    FunctionDeclaration(node) {
      if (node.id) functions.set(node.id.name, node);
    },
    JSXElement(node) {
      elements.push(node);
    },
    'Program:exit': analyse,
  };
});

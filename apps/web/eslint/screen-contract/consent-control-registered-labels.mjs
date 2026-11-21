// The labels of a control for the consent-control-registered rule (CHK-22), and whether the
// control reads as consent.
import { ScanError } from '../../../../scripts/ci/server-mutation/ast.mjs';
import { catalogueFor, messageText } from '../../../../scripts/ci/screen-contract/catalogue.mjs';
import {
  attributeOf,
  enclosingLabel,
  expressionOf,
  literalAttribute,
  walk,
} from './consent-control-registered-jsx.mjs';
import { translatorNamespaceOf } from './consent-control-registered-scope.mjs';

const VOCABULARY_RE =
  /consent|terms|privacy|gdpr|agree|accept[\w.-]*(?:terms|polic)|marketing|newsletter|opt-?in/iu;
const STRING_ATTRIBUTES = ['id', 'name', 'value', 'aria-label', 'data-testid'];
const HANDLER_ATTRIBUTES = ['checked', 'onCheckedChange', 'onChange'];

// Literal message keys of every translator call under `node`, with their full dotted key.
function messageKeys(context, keys, node) {
  const out = [];
  walk(
    node,
    n => {
      if (n.type !== 'CallExpression') return;
      const ns = translatorNamespaceOf(context, n.callee);
      if (ns === null) return;
      const arg = n.arguments[0];
      if (arg?.type !== 'Literal' || typeof arg.value !== 'string') return;
      out.push(ns ? `${ns}.${arg.value}` : arg.value);
    },
    keys
  );
  return out;
}

function labelTexts(keys, node) {
  const out = [];
  walk(node, n => n.type === 'JSXText' && out.push(n.value), keys);
  return out;
}

// The label elements of a control: enclosing, `htmlFor`, each `aria-labelledby` id, `label` prop.
function labelsOf(element, byId) {
  const opening = element.openingElement;
  const labels = [];
  const enclosing = enclosingLabel(element);
  if (enclosing) labels.push(enclosing);
  const id = literalAttribute(opening, 'id');
  if (id) labels.push(...(byId.labelsFor.get(id) ?? []));
  const labelledBy = (literalAttribute(opening, 'aria-labelledby') ?? '').split(/\s+/u);
  for (const ref of labelledBy.filter(Boolean)) labels.push(...(byId.elements.get(ref) ?? []));
  const labelProp = attributeOf(opening, 'label');
  if (labelProp) labels.push(labelProp);
  return labels;
}

function vocabularyHit(context, root, rel, keys, element, byId) {
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
  const labelLiteral = literalAttribute(opening, 'label');
  if (labelLiteral) words.push(labelLiteral);
  const labels = labelsOf(element, byId);
  const catalogue = labels.length ? catalogueFor(root) : null;
  for (const label of labels) {
    words.push(...labelTexts(keys, label));
    for (const key of messageKeys(context, keys, label)) {
      const text = messageText(catalogue, key);
      if (text === null)
        throw new ScanError(`${rel}: the label key ${key} is not in the English catalogue`);
      words.push(key, text);
    }
  }
  return words.some(word => VOCABULARY_RE.test(word));
}

export { vocabularyHit };

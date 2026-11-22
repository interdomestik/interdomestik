// JSX and node helpers of the consent-control-registered rule (CHK-22), without scope analysis.

const CONTROL_COMPONENTS = new Set(['Checkbox', 'Switch', 'RadioGroupItem']);
const CHOICE_TYPES = new Set(['checkbox', 'radio']);
const FORMS = new Set(['form', 'Form']);
const LABELS = new Set(['label', 'Label']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
// The native element a name renders (the UI map of the config; the shared `Input` forwards `type`):
// whose `formAction` submits the form, and the `type` values that submit (an absent type submits
// for a button only), and which `input`s are choice controls (r3 F6).
const SUBMIT_ELEMENTS = new Map([
  ['button', 'button'],
  ['Button', 'button'],
  ['input', 'input'],
  ['Input', 'input'],
]);
const SUBMIT_TYPES = { button: new Set(['submit']), input: new Set(['submit', 'image']) };
const SKIP = Symbol('skip');

const elementName = opening => (opening?.name?.type === 'JSXIdentifier' ? opening.name.name : null);
const attributeOf = (opening, name) =>
  opening.attributes.find(a => a.type === 'JSXAttribute' && a.name?.name === name) ?? null;
const contains = (outer, inner) =>
  outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];

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

// The dotted text of a JSX element name.
const jsxName = node =>
  node.type === 'JSXMemberExpression'
    ? [jsxName(node.object), node.property.name].join('.')
    : (node.name ?? '?');

const expressionOf = attribute =>
  attribute?.value?.type === 'JSXExpressionContainer' ? attribute.value.expression : null;

// Visits `node` and its children; a visitor returning SKIP prunes the node's children.
function walk(node, visit, keys) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node) === SKIP) return;
  for (const key of keys[node.type] ?? []) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach(c => walk(c, visit, keys));
    else walk(child, visit, keys);
  }
}

function isControl(opening) {
  const name = elementName(opening);
  if (CONTROL_COMPONENTS.has(name)) return true;
  return (
    SUBMIT_ELEMENTS.get(name) === 'input' && CHOICE_TYPES.has(literalAttribute(opening, 'type'))
  );
}

// A button or input whose `formAction` submits: a dynamic `type` counts (fail closed).
function isSubmitCapable(opening) {
  const kind = SUBMIT_ELEMENTS.get(elementName(opening));
  if (!kind) return false;
  if (!attributeOf(opening, 'type')) return kind === 'button';
  const type = literalAttribute(opening, 'type');
  return type === null || SUBMIT_TYPES[kind].has(type.toLowerCase());
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

export {
  FORMS,
  FUNCTIONS,
  LABELS,
  SKIP,
  attributeOf,
  contains,
  elementName,
  enclosingForm,
  enclosingLabel,
  expressionOf,
  isControl,
  isSubmitCapable,
  jsxName,
  literalAttribute,
  walk,
};

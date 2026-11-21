// A11Y, local rule (R-23g; design §2, H6, O2): a form control has a label. Scope, as tested: a
// native `input` or shared `Input` (not hidden, submit, button, reset or image), a `textarea` or
// `select`, and the shared `Checkbox` and `Textarea` components; a control with spread props is
// skipped and counted (the label may arrive in the spread); any other component is not checked.
import { fileOf, report, rule, unitCounter } from './common.mjs';

const CONTROLS = new Set(['input', 'textarea', 'select', 'Input', 'Checkbox', 'Textarea']);
const UNLABELLED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
// The elements whose `type` reaches a native input: the tag itself and the shared `Input`, which
// the config maps to `input` and which forwards `type` to it (code-r2).
const TYPED_INPUTS = new Set(['input', 'Input']);
const LABELS = new Set(['label', 'Label']);
const RULE_ID = 'screen-contract/labelled-control';

const elementName = opening => (opening.name.type === 'JSXIdentifier' ? opening.name.name : null);
const attribute = (opening, name) =>
  opening.attributes.find(a => a.type === 'JSXAttribute' && a.name?.name === name) ?? null;

// The literal string of an attribute value (`"x"`, `{"x"}`, `{`x`}`), or null.
function literalValue(attr) {
  const value = attr?.value;
  if (!value) return null;
  if (value.type === 'Literal' && typeof value.value === 'string') return value.value;
  const expression = value.type === 'JSXExpressionContainer' ? value.expression : null;
  if (expression?.type === 'Literal' && typeof expression.value === 'string')
    return expression.value;
  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0)
    return expression.quasis[0].value.cooked;
  return null;
}

// The variable an identifier names, through the scope chain, or null when it is not declared.
function variableOf(sourceCode, identifier) {
  for (let scope = sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable) return variable;
  }
  return null;
}

// A comparable form of an attribute value: a literal string, or the one variable an identifier
// names (r1 H5: two `fieldId` variables of different components are different targets).
function valueKey(attr, sourceCode) {
  const literal = literalValue(attr);
  if (literal !== null) return `"${literal}"`;
  const expression = attr?.value?.type === 'JSXExpressionContainer' ? attr.value.expression : null;
  if (expression?.type !== 'Identifier') return null;
  const definition = variableOf(sourceCode, expression)?.defs[0]?.name;
  return definition ? `{${expression.name}@${definition.range[0]}}` : `{${expression.name}}`;
}

function insideLabel(node) {
  for (let current = node.parent?.parent; current; current = current.parent)
    if (current.type === 'JSXElement' && LABELS.has(elementName(current.openingElement)))
      return true;
  return false;
}

export default rule('A form control has a label (A11Y)', context => {
  const { rel, role } = fileOf(context);
  if (role !== 'screen') return {};
  const units = unitCounter(context, 'A11Y');
  const controls = [];
  const labelTargets = new Set();
  return {
    JSXOpeningElement(node) {
      const name = elementName(node);
      if (LABELS.has(name)) {
        const target = valueKey(attribute(node, 'htmlFor'), context.sourceCode);
        if (target) labelTargets.add(target);
      }
      if (!CONTROLS.has(name)) return;
      const type = literalValue(attribute(node, 'type'));
      if (TYPED_INPUTS.has(name) && UNLABELLED_INPUT_TYPES.has(type)) return;
      if (node.attributes.some(a => a.type === 'JSXSpreadAttribute')) {
        units.add('skipped-spread');
        return;
      }
      units.add('control');
      controls.push({ node, name });
    },
    'Program:exit'(program) {
      for (const { node, name } of controls) {
        if (attribute(node, 'aria-label') || attribute(node, 'aria-labelledby')) continue;
        if (insideLabel(node)) continue;
        const id = valueKey(attribute(node, 'id'), context.sourceCode);
        if (id && labelTargets.has(id)) continue;
        report(context, node, `A11Y|${rel}|${RULE_ID}|${name}`, `<${name}> has no label`);
      }
      units.flush(program);
    },
  };
});

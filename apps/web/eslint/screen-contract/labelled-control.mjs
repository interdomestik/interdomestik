// A11Y, local rule (R-23g; design §2, H6, O2): a form control has a label. Scope, as tested: a
// native `input` (not hidden, submit, button, reset or image), `textarea` or `select`, and the
// shared `Input`, `Checkbox` and `Textarea` components; a control with spread props is skipped and
// counted (the label may arrive in the spread); any other component is not checked.
import { fileOf, report, rule, unitCounter } from './common.mjs';

const CONTROLS = new Set(['input', 'textarea', 'select', 'Input', 'Checkbox', 'Textarea']);
const UNLABELLED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
const LABELS = new Set(['label', 'Label']);
const RULE_ID = 'screen-contract/labelled-control';

const elementName = opening => (opening.name.type === 'JSXIdentifier' ? opening.name.name : null);
const attribute = (opening, name) =>
  opening.attributes.find(a => a.type === 'JSXAttribute' && a.name?.name === name) ?? null;

// A comparable form of an attribute value: a literal string, or the source of a plain identifier.
function valueKey(attr, sourceCode) {
  const value = attr?.value;
  if (!value) return null;
  if (value.type === 'Literal' && typeof value.value === 'string') return `"${value.value}"`;
  const expression = value.type === 'JSXExpressionContainer' ? value.expression : null;
  if (expression?.type === 'Literal' && typeof expression.value === 'string')
    return `"${expression.value}"`;
  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0)
    return `"${expression.quasis[0].value.cooked}"`;
  if (expression?.type === 'Identifier') return `{${sourceCode.getText(expression)}}`;
  return null;
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
      const type = attribute(node, 'type')?.value;
      if (name === 'input' && type?.type === 'Literal' && UNLABELLED_INPUT_TYPES.has(type.value))
        return;
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

const TAGS = new Set([
  'a',
  'article',
  'aside',
  'button',
  'details',
  'div',
  'header',
  'h1',
  'h2',
  'input',
  'label',
  'legend',
  'fieldset',
  'li',
  'main',
  'nav',
  'p',
  'section',
  'select',
  'span',
  'strong',
  'summary',
  'textarea',
  'ul',
  'option',
]);
const ATTRIBUTES = new Set([
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-live',
  'aria-required',
  'aria-atomic',
  'aria-busy',
  'aria-disabled',
  'class',
  'checked',
  'data-item-id',
  'data-status',
  'data-live-region',
  'href',
  'for',
  'id',
  'maxlength',
  'name',
  'required',
  'readonly',
  'accept',
  'disabled',
  'role',
  'rows',
  'tabindex',
  'type',
  'value',
]);
const EVENTS = new Set(['click', 'change', 'input']);
let activeDocument = typeof document === 'undefined' ? null : document;

export function setDocument(value) {
  activeDocument = value;
}

export function text(value) {
  return activeDocument.createTextNode(String(value ?? ''));
}

export function element(tag, options = {}, children = []) {
  if (!TAGS.has(tag)) throw new TypeError(`Unsupported tag: ${tag}`);
  if (Object.hasOwn(options, 'innerHTML')) throw new TypeError('innerHTML is not allowed.');
  const node = activeDocument.createElement(tag);
  if (Object.hasOwn(options, 'textContent')) node.textContent = String(options.textContent ?? '');
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    if (!ATTRIBUTES.has(name)) throw new TypeError(`Unsupported attribute: ${name}`);
    if (name === 'href' && !safeHref(value)) throw new TypeError('Unsafe URL is not allowed.');
    node.setAttribute(name, value);
  }
  for (const [name, handler] of Object.entries(options.on ?? {})) {
    if (!EVENTS.has(name) || typeof handler !== 'function') {
      throw new TypeError(`Unsupported event: ${name}`);
    }
    node.addEventListener(name, handler);
  }
  node.append(...children.filter(Boolean));
  return node;
}

export function replaceChildren(target, children = []) {
  target.replaceChildren(...children.filter(Boolean));
  return target;
}

function safeHref(value) {
  return typeof value === 'string' && (value.startsWith('#/') || value.startsWith('#main'));
}

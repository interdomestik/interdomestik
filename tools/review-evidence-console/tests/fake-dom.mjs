export class FakeNode {
  constructor(tagName = '#text', value = '') {
    this.tagName = tagName.toUpperCase();
    this.textContent = value;
    this.attributes = {};
    this.childNodes = [];
    this.listeners = {};
    this.value = '';
    this.checked = false;
  }
  append(...nodes) {
    this.childNodes.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.childNodes = [...nodes];
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }
  focus() {
    this.focused = true;
  }
}

export const fakeDocument = {
  createElement: tag => new FakeNode(tag),
  createTextNode: value => new FakeNode('#text', String(value)),
};

export function walk(node) {
  return [node, ...node.childNodes.flatMap(walk)];
}
export function copy(node) {
  return walk(node)
    .map(entry => entry.textContent)
    .join(' ');
}
export function byId(node, id) {
  return walk(node).find(entry => entry.attributes.id === id);
}

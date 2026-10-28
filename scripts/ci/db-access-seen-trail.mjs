// Internal traversal membership only; no provenance results or verdicts are stored.
class SeenTrail {
  #parent;
  #base;
  #value;
  #size;

  constructor(parent, value, base) {
    this.#parent = parent;
    this.#base = base;
    this.#value = value;
    this.#size = parent ? parent.size + 1 : base.size;
    Object.freeze(this);
  }

  get size() {
    return this.#size;
  }

  has(value) {
    let cursor = this;
    while (cursor.#parent) {
      const present = cursor.#value;
      if (present === value || (present !== present && value !== value)) return true;
      cursor = cursor.#parent;
    }
    return cursor.#base.has(value);
  }

  *[Symbol.iterator]() {
    const suffix = [];
    let cursor = this;
    while (cursor.#parent) {
      suffix.push(cursor.#value);
      cursor = cursor.#parent;
    }
    yield* cursor.#base;
    for (let index = suffix.length - 1; index >= 0; index--) yield suffix[index];
  }
}

export function appendSeenTrail(seen, value) {
  // Snapshot external iterables: mutating a native input cannot affect descendants.
  const parent = seen instanceof SeenTrail ? seen : new SeenTrail(null, undefined, new Set(seen));
  if (parent.has(value)) return parent;
  // Native Set canonicalizes negative zero when inserting it.
  return new SeenTrail(parent, value === 0 ? 0 : value, null);
}

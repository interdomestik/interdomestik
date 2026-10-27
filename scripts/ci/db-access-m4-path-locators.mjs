import ts from 'typescript';

const fail = () => {
  throw Error('incomplete: M4 path transport source locator');
};

// Only requested positions survive validation; never retain every AST node position.
export function createM4PathLocatorCheck(model) {
  const requested = new Map();
  return {
    add(value, required = false) {
      if (value === null && !required) return;
      if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        typeof value[0] !== 'string' ||
        !model.parsed.has(value[0]) ||
        !value.slice(1).every(Number.isSafeInteger) ||
        value[1] < 0 ||
        value[2] < value[1] ||
        value[3] < 0
      )
        fail();
      const file = requested.get(value[0]) ?? new Map();
      const positions = file.get(value[1]) ?? new Set();
      positions.add(JSON.stringify(value));
      file.set(value[1], positions);
      requested.set(value[0], file);
    },
    finish() {
      for (const [file, positions] of requested) {
        let remaining = [...positions.values()].reduce((sum, values) => sum + values.size, 0);
        function visit(node) {
          const keys = positions.get(node.pos);
          if (keys?.delete(JSON.stringify([file, node.pos, node.end, node.kind]))) remaining--;
          if (remaining) ts.forEachChild(node, visit);
        }
        visit(model.parsed.get(file));
        if (remaining) fail();
      }
    },
  };
}

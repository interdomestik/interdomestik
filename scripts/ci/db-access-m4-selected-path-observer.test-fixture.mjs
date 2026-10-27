import { createM4SelectedPathObserver } from './db-access-m4-selected-path-observer.mjs';
import { createIncompleteCollector } from './db-access-incomplete.mjs';

// Pure observer fixtures only; these values are not native/source authority.
export function fixture() {
  const selected = { file: 'selected.ts', pos: 0, end: 20, kind: 262 };
  const child = { file: 'child.ts', pos: 0, end: 10, kind: 262 };
  const owners = new Set([selected]),
    bindings = new Map();
  const reads = { locate: 0, peek: 0 };
  const observer = createM4SelectedPathObserver({
    isSelectedOwner: node => owners.has(node),
    locate(node) {
      reads.locate++;
      return [node.file, node.pos, node.end, node.kind];
    },
    peekBindings(token) {
      reads.peek++;
      return bindings.get(token);
    },
  });
  const collector = createIncompleteCollector();
  const originalPush = collector.push;
  observer.begin();
  const detach = observer.installDiagnostics(collector);
  const row = (identity = 'one', origin = 'root.ts', node = selected) => ({
    identity,
    origin,
    owner: [node.file, node.pos, node.end, node.kind],
    invocation: null,
    context: null,
    definingContext: null,
    outcome: 'visited',
    receiver: 'ambient',
    unsafe: true,
    incomplete: true,
    indirect: false,
    escaped: false,
    open: false,
    dispatchUnknown: [],
    occurrences: 1,
  });
  function enter(rows = [row()], owner = selected, context) {
    const token = observer.enter(owner, rows[0].origin, undefined, context, undefined);
    observer.activate(new Map(rows.map(value => [Object.freeze({}), value])));
    return token;
  }
  return {
    originalPush,
    selected,
    child,
    owners,
    bindings,
    reads,
    observer,
    collector,
    detach,
    row,
    enter,
    finish() {
      detach();
      return observer.finish();
    },
  };
}

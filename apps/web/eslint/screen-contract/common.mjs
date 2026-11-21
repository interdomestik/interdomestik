// Shared plumbing of the screen-contract rules (WP-05 design §3). Each finding's message carries its
// item key as `⟦key⟧ text`, because an ESLint message has no structured data; coverage units are
// reported once per file and kind as `⟦#unit|<check>|<kind>|<count>⟧`.
import { roleOf } from '../../../../scripts/ci/screen-contract/roles.mjs';
import { resolverFor, toRel } from '../../../../scripts/ci/screen-contract/specifiers.mjs';

export function fileOf(context) {
  const root = context.cwd;
  const rel = toRel(root, context.filename);
  return { root, rel, role: roleOf(rel) };
}

export const resolverOf = context => resolverFor(context.cwd);

export function report(context, node, key, text) {
  context.report({ node, message: `⟦${key}⟧ ${text}` });
}

// Counts units per kind and reports them at the end of the file.
export function unitCounter(context, check) {
  const counts = new Map();
  return {
    add(kind, n = 1) {
      counts.set(kind, (counts.get(kind) ?? 0) + n);
    },
    flush(node) {
      for (const [kind, n] of [...counts].sort(([a], [b]) => (a < b ? -1 : Number(a > b))))
        report(context, node, `#unit|${check}|${kind}|${n}`, 'coverage');
    },
  };
}

export const rule = (description, create) => ({
  meta: { type: 'problem', docs: { description }, schema: [] },
  create,
});

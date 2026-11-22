// CHK-15b (R-15, R-23c): an import reaches another package only through its `exports` (design §2,
// §2.2): a workspace specifier must resolve to a non-null target whose file exists in every
// environment that builds the edge, and a relative or `@/` path never reaches into another
// package's directory.
import {
  checkEdge,
  unmodelledConditions,
} from '../../../../scripts/ci/screen-contract/exports.mjs';
import {
  edgesOfProgram,
  kindOfSpecifier,
} from '../../../../scripts/ci/screen-contract/specifiers.mjs';
import { fileOf, report, resolverOf, rule, unitCounter } from './common.mjs';

export default rule('An import reaches a package only through its exports (CHK-15b)', context => {
  const { rel, role } = fileOf(context);
  if (role === null || role === 'test') return {};
  const units = unitCounter(context, 'CHK-15b');
  function checkWorkspaceEdge(resolver, ownDir, edge, key) {
    const target = resolver.workspace(edge.specifier);
    if (target.entry?.dir === ownDir) return;
    units.add(`edge:${edge.kind}`);
    if (!target.entry) {
      report(context, edge.node, key, `unknown workspace package ${target.name}`);
      return;
    }
    for (const condition of unmodelledConditions(target.entry.pkg))
      units.add(`unmodelled:${condition}`);
    const verdict = checkEdge(
      target.entry.pkg,
      target.subpath,
      edge.kind,
      resolver.existsIn(target.entry.dir)
    );
    if (verdict.ok) return;
    const refused = Object.entries(verdict.environments)
      .filter(([, result]) => result.status !== 'resolved')
      .map(([env, result]) => `${env}: ${result.status}`)
      .join(', ');
    report(context, edge.node, key, `${edge.specifier} is not exported (${refused})`);
  }

  function checkPathEdge(resolver, ownDir, edge, key) {
    units.add(`edge:${edge.kind}`);
    const file = resolver.resolveFile(rel, edge.specifier);
    const dir = file && resolver.packageDirOf(file);
    if (dir && dir !== ownDir)
      report(context, edge.node, key, `${edge.specifier} reaches into ${dir} past its exports`);
  }

  return {
    'Program:exit'(program) {
      const resolver = resolverOf(context);
      const ownDir = resolver.packageDirOf(rel);
      units.add('file');
      for (const edge of edgesOfProgram(program, context.sourceCode.visitorKeys)) {
        const kind = kindOfSpecifier(edge.specifier);
        const key = `CHK-15b|${rel}|${edge.specifier}`;
        if (kind === 'workspace') checkWorkspaceEdge(resolver, ownDir, edge, key);
        else if (kind === 'relative' || kind === 'alias')
          checkPathEdge(resolver, ownDir, edge, key);
      }
      units.flush(program);
    },
  };
});

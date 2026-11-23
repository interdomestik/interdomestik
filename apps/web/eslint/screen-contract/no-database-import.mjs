// CHK-15c (R-15, R-23b/c): a screen file never imports the database (design §2).
import {
  edgesOfProgram,
  kindOfSpecifier,
} from '../../../../scripts/ci/screen-contract/specifiers.mjs';
import { fileOf, report, resolverOf, rule, unitCounter } from './common.mjs';

const DATABASE_RE = /^(?:(?:@interdomestik\/database|drizzle-orm)(?:\/.*)?|postgres|pg)$/u;

export default rule('A screen file does not import the database (CHK-15c)', context => {
  const { rel, role } = fileOf(context);
  if (role !== 'screen') return {};
  const units = unitCounter(context, 'CHK-15c');
  return {
    'Program:exit'(program) {
      const resolver = resolverOf(context);
      units.add('file');
      for (const edge of edgesOfProgram(program, context.sourceCode.visitorKeys, {
        rel,
        sourceCode: context.sourceCode,
      })) {
        units.add(`edge:${edge.kind}`);
        // Every file a relative or `@/` path can name (the WP-05 flip, D-1), reported once.
        const local = ['relative', 'alias'].includes(kindOfSpecifier(edge.specifier))
          ? resolver.resolveTargets(rel, edge.specifier, edge.kind)
          : [];
        if (
          DATABASE_RE.test(edge.specifier) ||
          local.some(file => file.startsWith('packages/database/'))
        )
          report(
            context,
            edge.node,
            `CHK-15c|${rel}|${edge.specifier}`,
            `screen imports the database through ${edge.specifier}`
          );
      }
      units.flush(program);
    },
  };
});

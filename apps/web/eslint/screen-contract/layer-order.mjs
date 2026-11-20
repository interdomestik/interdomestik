// CHK-15a (R-15): no import from a higher layer to a lower one, with one layer function for both
// ends of the edge (design §1, §2; B1, B15).
import fs from 'node:fs';
import path from 'node:path';

import { directivesOfProgram, layerOf } from '../../../../scripts/ci/screen-contract/roles.mjs';
import {
  edgesOfProgram,
  kindOfSpecifier,
  packageRole,
} from '../../../../scripts/ci/screen-contract/specifiers.mjs';
import { fileOf, report, resolverOf, rule, unitCounter } from './common.mjs';

const LAYER_OF_PACKAGE_ROLE = { domain: 3, database: 4 };
const textLayers = new Map();

function fileLayer(root, rel) {
  const key = `${root}\u0000${rel}`;
  if (!textLayers.has(key))
    textLayers.set(key, layerOf(rel, fs.readFileSync(path.join(root, rel), 'utf8')));
  return textLayers.get(key);
}

function targetLayer(resolver, rel, specifier) {
  const target = resolver.resolveFile(rel, specifier);
  if (target) return { target, layer: fileLayer(resolver.root, target) };
  if (kindOfSpecifier(specifier) !== 'workspace') return null;
  const entry = resolver.workspace(specifier)?.entry;
  if (!entry) return null;
  return { target: entry.dir, layer: LAYER_OF_PACKAGE_ROLE[packageRole(entry.dir)] ?? null };
}

export default rule(
  'An import never goes from a higher R-15 layer to a lower one (CHK-15a)',
  context => {
    const { rel, role } = fileOf(context);
    if (role === null || role === 'test') return {};
    const units = unitCounter(context, 'CHK-15a');
    return {
      'Program:exit'(program) {
        const layer = layerOf(rel, directivesOfProgram(program));
        if (layer === null || layer < 2) return;
        const resolver = resolverOf(context);
        units.add(`source:${layer}`);
        for (const edge of edgesOfProgram(program, context.sourceCode.visitorKeys)) {
          if (kindOfSpecifier(edge.specifier) === 'external') continue;
          units.add(`edge:${layer}`);
          const hit = targetLayer(resolver, rel, edge.specifier);
          if (hit?.layer && hit.layer < layer)
            report(
              context,
              edge.node,
              `CHK-15a|${rel}|${edge.specifier}`,
              `layer ${layer} imports layer ${hit.layer} (${hit.target})`
            );
        }
        units.flush(program);
      },
    };
  }
);

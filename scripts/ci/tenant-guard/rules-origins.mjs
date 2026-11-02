// Tenant guard helper: the resolved origins of every production reference, in a fixed order.

import { byCodeUnit } from './rules-digest.mjs';

const DECLARATION_FILE = /\.d\.[cm]?ts$/u;

/**
 * Visits every resolved origin of every bound reference in the production (non-test,
 * non-declaration) files that `skipFile` keeps, in code-unit file order.
 */
export function forEachOrigin({ factsOf, isTest, originsOf, sources }, skipFile, visit) {
  for (const file of [...sources.keys()].sort(byCodeUnit)) {
    if (isTest(file) || DECLARATION_FILE.test(file) || skipFile(file)) continue;
    const fact = factsOf(file);
    if (!fact) continue;
    for (const reference of fact.references.filter(entry => entry.binding)) {
      const { origins, form } = originsOf(fact, reference);
      for (const origin of origins) visit({ file, fact, reference, origin, form });
    }
  }
}

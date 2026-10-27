// Fixed producer data selects finite consequences, never whole-effect qualification.
import { exact, hash } from './db-access-provider-runtime-identity.mjs';
import { mandatoryM4Assertion } from './db-access-m4-assertion-nodes.mjs';

const contracts = [
  'db-access-m4-ops-oracle-contract.json',
  'db-access-m4-existing-oracle-contract.json',
];
const fail = reason => {
  throw Error('M4 fixed oracle correspondence refused: ' + reason);
};
function factAt(source, pointer) {
  if (!pointer.startsWith('/derivations/')) fail('source fact path');
  let value = source;
  for (const key of pointer.slice(1).split('/')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
      fail('missing derived source fact ' + pointer);
    value = value[key];
  }
  return value;
}

// Caller authenticates the live native and runtime objects before this pure join.
// This function cannot create either private handle or accepted coverage.
export function linkM4FixedOracleCases({ source, runtime, imageRecords, producer, policy }) {
  const fixtureCache = new Map(),
    caseKeys = new Set(),
    linkIds = new Set(),
    links = [];
  for (const name of contracts) {
    const file = 'scripts/ci/' + name;
    const contract = JSON.parse(exact(producer, file, policy.producerFiles[file]));
    if (contract.version !== 1 || !Array.isArray(contract.cases) || !contract.cases.length)
      fail('fixed contract cases');
    for (const entry of contract.cases) {
      if (!['private', 'profiles'].includes(entry.caseGroup)) fail('case group');
      const ids =
        runtime.completion[entry.caseGroup === 'private' ? 'privateCaseIds' : 'profileCaseIds'];
      if (!Array.isArray(ids) || ids.filter(id => id === entry.caseId).length !== 1)
        fail('fixed case did not complete in its exact group');
      const key = JSON.stringify([entry.fixtureFile, entry.caseId]);
      if (caseKeys.has(key)) fail('duplicate fixed case');
      caseKeys.add(key);
      const fixturePath = 'scripts/ci/' + entry.fixtureFile;
      let fixture = fixtureCache.get(fixturePath);
      if (!fixture) {
        fixture = exact(producer, fixturePath, policy.producerFiles[fixturePath]);
        if (imageRecords[entry.fixtureFile]?.sha256 !== hash(fixture))
          fail('fixture differs from actual executed sealed image');
        fixtureCache.set(fixturePath, fixture);
      }
      if (typeof entry.program !== 'string' || !entry.program || !entry.links?.length)
        fail('fixed oracle program or links');
      for (const link of entry.links) {
        if (linkIds.has(link.id)) fail('duplicate fact/assertion link');
        linkIds.add(link.id);
        const fact = factAt(source, link.factPath);
        if (hash(JSON.stringify(fact)) !== link.factSha256) fail('derived fact changed');
        if (!link.sourceFiles?.length || !link.assertions?.length || !link.scope)
          fail('missing finite source/assertion scope');
        const executionContext = link.executionContext ?? 'fixed-fixture';
        if (!['fixed-fixture', 'database-visibility-fault'].includes(executionContext))
          fail('unknown fixed execution context');
        const sourceFiles = link.sourceFiles.map(file => {
          const sha256 = source.sourceRecords[file]?.sha256;
          if (!sha256 || imageRecords[file]?.sha256 !== sha256)
            fail('fact source differs between native and executed image');
          return { file, sha256 };
        });
        links.push({
          id: link.id,
          fact: { path: link.factPath, sha256: link.factSha256, sourceFiles },
          fixtureSha256: hash(fixture),
          caseGroup: entry.caseGroup,
          assertions: link.assertions.map(expression =>
            mandatoryM4Assertion(
              fixture.toString('utf8'),
              fixturePath,
              entry.caseId,
              expression,
              entry.program
            )
          ),
          scope: link.scope,
          executionContext,
          executionObserved: true,
          completeEffectQualified: false,
        });
      }
    }
  }
  return links;
}

// Fixed four-module strict observation derivation. No execution or admission authority.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { runtimeModule } from './db-access-m4-runtime-source-ast.mjs';
import { deepFreeze } from './db-access-m4-syntax.mjs';
const fixed = deepFreeze(
  JSON.parse(
    fs.readFileSync(
      new URL('./db-access-m4-strict-observation-contract.json', import.meta.url),
      'utf8'
    )
  )
);
const fail = reason => {
  throw Error('M4 strict observation source rejected: ' + reason);
};
const digest = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function deriveM4StrictObservationSource({
  runtimeSource,
  contextSource,
  ownerSource,
  listenerSource,
  commandSource,
  retirementSource,
  ownerCaptureSource,
}) {
  const sources = {
    runtime: runtimeSource,
    context: contextSource,
    owner: ownerSource,
    listener: listenerSource,
    command: commandSource,
    retirement: retirementSource,
    ownerCapture: ownerCaptureSource,
  };
  if (fixed.version !== 1 || fixed.kind !== 'actual-strict-constructor-observation-v1')
    fail('fixed contract');
  const nodes = [],
    sourceRecords = {};
  for (const [role, text] of Object.entries(sources)) {
    const file = fixed.files[role];
    const actual = runtimeModule(text, file),
      expected = runtimeModule(fixed.sources[role], file);
    if (
      !same(actual.runtimeTree, expected.runtimeTree) ||
      !same(actual.typeExports, expected.typeExports) ||
      !same(actual.taggedLiteralTokens, expected.taggedLiteralTokens)
    )
      fail(role + ' exact executable law');
    sourceRecords[file] = { sha256: digest(text), bytes: Buffer.byteLength(text) };
    for (const name of fixed.functions[role]) {
      const found = actual.source.statements.filter(
        node => ts.isFunctionDeclaration(node) && node.name?.text === name
      );
      if (found.length !== 1) fail('unique fixed function ' + name);
      const node = found[0];
      nodes.push({
        role,
        file,
        name,
        locator: [file, node.pos, node.end, node.kind],
        bodySha256: digest(JSON.stringify(actual.observed.get(node))),
      });
    }
  }
  return deepFreeze({
    version: 1,
    kind: fixed.kind,
    sourceRecords,
    sourceNodes: nodes,
    guarantees: [
      'fixed observed runtime entry internally brands its own frozen configuration, calls actual createM4PrivateAssignmentRuntime, and deletes request identity in finally',
      'actual named strict owner consumes only internally enrolled identity before its source-owned configuration clones; fixed observed runtime is selected only for that request',
      'strict constructor still uses construct false and strict listener listen false; observation never selects local TLS exception',
      'strict observation has independent bounded counters; ordinary strict instances remain unobserved and unthrottled by qualification counters',
      'actual post-posture receiver/verifier capture and strict HTTPS transcript retain one-use closed drained owner identity',
      'strict/local takes and output provenance remain separate; supplied rows or configuration-shaped clones cannot enroll an owner',
    ],
    runtimeAdmission: false,
    nativeAdmission: false,
    nextActionIngressQualified: false,
    productionCCredit: 0,
    sourcePremiseOnly: true,
    remainingPremises: [
      'actual strict current-store/purpose-role/TLS/SQL execution and complete exception schedules',
      'authentic compiled image, actual Next action ingress, browser trust and capability/loader containment',
      'same source/policy/event private compiled owner, ordinary bank conjunction and final semantic negative',
      'all original native IDs, contexts, multiplicities and unmatched production obligations',
    ],
  });
}

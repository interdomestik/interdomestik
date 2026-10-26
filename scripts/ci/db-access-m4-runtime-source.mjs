// Finite literal bootstrap/posture composition. No runtime or native admission authority.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { runtimeModule, typeModule, reject } from './db-access-m4-runtime-source-ast.mjs';
import { runtimeClauses } from './db-access-m4-runtime-source-clauses.mjs';
import { deepFreeze } from './db-access-m4-syntax.mjs';
export const FILES = Object.freeze({
  bootstrap: 'apps/web/src/server/operations/m4-private-runtime.ts',
  posture: 'apps/web/src/server/operations/m4-pool-posture.ts',
  runtimeTypes: 'apps/web/src/server/operations/m4-private-runtime-types.ts',
  controllerTypes: 'apps/web/src/server/operations/m4-assignment-controller-types.ts',
});
// Fixed adjacent producer data; no caller-selected path, policy or contract argument.
const contract = deepFreeze(
  JSON.parse(
    fs.readFileSync(new URL('./db-access-m4-runtime-source-contract.json', import.meta.url), 'utf8')
  )
);
const equal = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) reject(label);
};
equal(contract.version, 1, 'fixed contract version');
equal(contract.files, FILES, 'fixed contract files');
equal(Object.keys(contract.sources), Object.keys(FILES), 'fixed contract source roles');
const digest = text => createHash('sha256').update(text).digest('hex');
function matched(source, key) {
  const actual = runtimeModule(source, FILES[key]);
  const expected = runtimeModule(contract.sources[key], FILES[key]);
  equal(actual.typeExports, expected.typeExports, key + ': erased export bindings');
  equal(
    actual.taggedLiteralTokens,
    expected.taggedLiteralTokens,
    key + ': tagged literal spelling'
  );
  equal(
    actual.runtimeTree,
    expected.runtimeTree,
    key + ': complete imports/bindings/control/effects'
  );
  return { ...actual, expected };
}
export function deriveM4PrivateRuntimeSource({
  bootstrapSource,
  postureSource,
  runtimeTypesSource,
  controllerTypesSource,
}) {
  const sources = {
    bootstrap: bootstrapSource,
    posture: postureSource,
    runtimeTypes: runtimeTypesSource,
    controllerTypes: controllerTypesSource,
  };
  const bootstrap = matched(bootstrapSource, 'bootstrap'),
    posture = matched(postureSource, 'posture');
  const types = {};
  for (const key of ['runtimeTypes', 'controllerTypes']) {
    types[key] = typeModule(sources[key], FILES[key]);
    equal(
      types[key],
      typeModule(contract.sources[key], FILES[key]),
      key + ': exact erased type contract'
    );
  }
  // Complete module trees stay in facts once; named clauses bind their checked subtrees
  // without serializing the full construct/work body repeatedly in the source receipt.
  const namedOrderedFacts = Object.fromEntries(
    Object.entries(runtimeClauses(bootstrap, posture)).map(([group, clauses]) => [
      group,
      clauses.map(({ tree, ...clause }) => ({
        ...clause,
        treeSha256: digest(JSON.stringify(tree)),
      })),
    ])
  );
  const facts = {
    bootstrapTree: bootstrap.runtimeTree,
    bootstrapTypeExports: bootstrap.typeExports,
    postureTree: posture.runtimeTree,
    postureTaggedLiteralTokens: posture.taggedLiteralTokens,
    types,
    namedOrderedFacts,
  };
  return deepFreeze({
    version: 1,
    sourcePremiseOnly: true,
    runtimeAdmission: false,
    nativeAdmission: false,
    allExecutableContextsQualified: false,
    productionEventAuthenticated: false,
    sourceSha256: Object.fromEntries(
      Object.entries(sources).map(([role, text]) => [FILES[role], digest(text)])
    ),
    facts,
    factsSha256: digest(JSON.stringify(facts)),
    namedOrderedFacts,
    sourceNodes: Object.entries(namedOrderedFacts).flatMap(([group, clauses]) =>
      clauses.map(c => ({
        file: group === 'posture' ? FILES.posture : FILES.bootstrap,
        group,
        name: c.name,
        start: c.start,
        end: c.end,
        line: c.line,
        kind: c.kind,
      }))
    ),
    guarantees: [
      'Complete ordered executable AST and fixed import/local bindings match independent producer contracts; additional execution, alternate effects and runtime type-module imports are rejected.',
      'Trusted construction captures and validates issuer/deadline/URL primitives, distinct purpose logins and one endpoint; it exposes only frozen fixed operation and close methods.',
      'Request command/observation validation and the max-four owned-operation gate precede pool creation; no request chooses an identity, purpose, verifier, arbitrary driver option or transport mode.',
      'Fresh identity/data pools use fixed options and awaited posture gates; concrete current-store verifier receives identity Drizzle and every fixed controller receives data Drizzle, with the actual owned notifier for legacy profiles.',
      'Production/local constructor literals fix TLS versus loopback qualification. Target normalization and driver-environment guards precede actual connection construction.',
      'Exact server-side posture SQL binds login/database and checks current/session identity, polling, forbidden privileges, memberships, ownership and callable definers before requiring one numeric gate row.',
      'Stop marks uncertainty and retains original operation identity; pool termination is memoized per owned operation, work settlement is awaited and slots are released only in cleanup. No automatic retry or no-dispatch inference exists.',
      'Idempotent close rejects new admission, stops owned work and waits its completion plus notification DB owner closure; complete type contracts contain no runtime effect.',
    ],
    premises: [
      'B0 trusts the provisioning/backend process. Authentic original issuer configuration and restricted purpose URLs must be supplied by qualified deployment code; TypeScript configuration types do not authenticate arbitrary caller objects/getters.',
      'The fixed controller, identity, assignment kernel and notification source derivations must join these concrete imports. Every schema/operator/vendor/compiler/loader/helper and unmodified JS intrinsic must match the protected installed image.',
      'Actual Better Auth signature/current-store/expiry cleanup, role grants and RLS, PostgreSQL posture semantics, lock/commit/rollback and driver generation/initial/FATAL/termination behavior require separately executed evidence. Role posture is a checked snapshot, not continuous administrative immutability.',
      'Local qualification uses TLS false and does not qualify production certificate/endpoint behavior. Awaiting driver settlement is not a universal wall-clock bound under arbitrary network failure.',
      'Imported email renderer/SMTP/Resend/fallback effects require their own applicable source/runtime proof. The actual28 SQL cases do not prove verified-email delivery. Already-started email is uncancellable and outside DB close/quota; no universal delivery/outbox/retry/exactly-once claim.',
      'Authenticated mounted ingress/observation/cache adapters, every actual old/new native identity and executable context, effect lineage and protected same-event producer/source/policy joins remain mandatory. No production C or native credit follows from this result.',
    ],
  });
}

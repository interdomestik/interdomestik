import { deriveM4MountedSource } from './db-access-m4-mounted-source.mjs';
import { deriveM4PrivateRuntimeSource } from './db-access-m4-runtime-source.mjs';
import fs from 'node:fs';
import { deriveM4AssignmentNotification } from './db-access-m4-notification-source.mjs';
import { exact } from './db-access-provider-runtime-identity.mjs';
import { digest } from './db-access-trust.mjs';
import { deriveM4AssignmentKernel } from './db-access-m4-source.mjs';
import { deriveM4AssignmentKernels } from './db-access-m4-assignment-kernels-source.mjs';
import { deriveM4OpsController } from './db-access-m4-controller-source.mjs';
import { deriveM4IdentitySource } from './db-access-m4-identity-source.mjs';
import { M4_PROOF_POLICY } from './db-access-m4-proof-policy.mjs';

const authenticated = new WeakSet();
const models = new WeakMap();
const rejected = new WeakSet();
const files = Object.freeze({
  kernel: 'apps/web/src/features/admin/claims/actions/ops-assignment.ts',
  controller: 'apps/web/src/server/operations/m4-ops-controller.ts',
  protocol: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
  verifier: 'apps/web/src/lib/auth/current-store-session.ts',
  userSchema: 'apps/web/src/lib/auth/user-schema.ts',
  session: 'packages/shared-auth/src/session.ts',
  resolver: 'packages/shared-auth/package.json',
  bootstrap: 'apps/web/src/server/operations/m4-private-runtime.ts',
  context: 'apps/web/src/server/operations/m4-private-runtime-context.ts',
  posture: 'apps/web/src/server/operations/m4-pool-posture.ts',
  wire: 'apps/web/src/server/operations/m4-assignment-wire.ts',
  controllerTypes: 'apps/web/src/server/operations/m4-assignment-controller-types.ts',
  kernelShared: 'apps/web/src/server/operations/m4-assignment-kernel-shared.ts',
  legacyKernel: 'apps/web/src/server/operations/m4-legacy-assignment-kernel.ts',
  staffKernel: 'apps/web/src/server/operations/m4-staff-assignment-kernel.ts',
  notificationRuntime: 'apps/web/src/server/operations/m4-notification-runtime.ts',
  notifier: 'apps/web/src/server/operations/m4-assignment-postcommit.ts',
  runtimeTypes: 'apps/web/src/server/operations/m4-private-runtime-types.ts',
  mountedAdminPublic: 'apps/web/src/actions/admin-claims.ts',
  mountedAdminMount: 'apps/web/src/actions/admin-claims.core.ts',
  mountedAdminBarrel: 'apps/web/src/actions/admin-claims/assign.ts',
  mountedAdminAdapter: 'apps/web/src/actions/admin-claims/assign.core.ts',
  mountedAgentPublic: 'apps/web/src/actions/agent-claims.ts',
  mountedAgentMount: 'apps/web/src/actions/agent-claims.core.ts',
  mountedAgentBarrel: 'apps/web/src/actions/agent-claims/assign.ts',
  mountedAgentAdapter: 'apps/web/src/actions/agent-claims/assign.core.ts',
  mountedStaffMount: 'apps/web/src/actions/staff-claims.core.ts',
  mountedStaffBarrel: 'apps/web/src/actions/staff-claims/assign.ts',
  mountedStaffAdapter: 'apps/web/src/actions/staff-claims/assign.core.ts',
  mountedRelay: 'apps/web/src/server/operations/m4-assignment-relay.ts',
  mountedClient: 'apps/web/src/server/operations/m4-assignment-relay-client.ts',
  mountedRelayWire: 'apps/web/src/server/operations/m4-assignment-relay-wire.ts',
  mountedOwner: 'apps/web/src/server/operations/m4-assignment-owner.ts',
  mountedOwnerHttp: 'apps/web/src/server/operations/m4-assignment-owner-http.ts',
  mountedOwnerConfig: 'apps/web/src/server/operations/m4-assignment-owner-config.ts',
  mountedOwnerEntry: 'apps/web/src/server/operations/m4-assignment-owner-entry.ts',
});
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const fail = reason => {
  throw Error('incomplete: m4 source ' + reason);
};
const canonical = value => JSON.stringify(value);
const mountedContract = freeze(
  JSON.parse(
    fs.readFileSync(new URL('./db-access-m4-mounted-source-contract.json', import.meta.url), 'utf8')
  )
);

export function isVerifiedM4ProofSource(value) {
  return authenticated.has(value);
}
export function m4SourceMatchesModel(value, model) {
  const binding = models.get(value);
  if (!authenticated.has(value) || binding?.model !== model) return false;
  try {
    return value.files.every(file => {
      const content = exact(binding.root, file, value.sourceRecords[file]).toString('utf8');
      return (
        (file.endsWith('.json') ? model.sources.get(file) : model.parsed.get(file)?.text) ===
        content
      );
    });
  } catch {
    return false;
  }
}
export function isM4SemanticRejection(value) {
  return rejected.has(value);
}

export function verifyM4ProofSource(repoRoot, model, policy) {
  // Existing test-only adoption epochs retain their own source contract. Production
  // prepareGuardModel always supplies the fixed policy for the canonical adoption.
  if (!policy.m4Proof && policy.adoptionCommit !== M4_PROOF_POLICY.adoptionCommit) return undefined;
  if (policy.m4Proof !== M4_PROOF_POLICY) fail('policy is not the fixed producer object');
  const contract = M4_PROOF_POLICY;
  if (
    contract.version !== 2 ||
    contract.id !== 's8-early-m4-source-prerequisite-v2' ||
    contract.runtimeAdmission !== false ||
    canonical(contract.files) !== canonical(files) ||
    Object.keys(contract.sources).sort().join('|') !== Object.values(files).sort().join('|') ||
    contract.adoptionCommit !== policy.adoptionCommit ||
    contract.adoptionTree !== policy.adoptionTree ||
    contract.baselineSha256 !== policy.baselineSha256
  )
    fail('fixed source contract/adoption mismatch');
  const root = fs.realpathSync(repoRoot);
  const read = () =>
    Object.fromEntries(
      Object.entries(files).map(([role, file]) => {
        const content = exact(root, file, contract.sources[file]).toString('utf8');
        const actual = file.endsWith('.json')
          ? model.sources.get(file)
          : model.parsed.get(file)?.text;
        if (actual !== content) fail('model/source mismatch ' + file);
        return [role, content];
      })
    );
  const before = read();
  const derivations = {};
  const failures = [];
  const attempt = (checker, body) => {
    try {
      derivations[checker] = body();
    } catch (error) {
      failures.push({ checker, reason: error.message });
    }
  };
  attempt('kernel', () => deriveM4AssignmentKernel(before.kernel));
  attempt('controller', () =>
    deriveM4OpsController({
      controllerSource: before.controller,
      protocolSource: before.protocol,
      wireSource: before.wire,
    })
  );
  attempt('notification', () =>
    deriveM4AssignmentNotification({
      notifierSource: before.notifier,
      notificationRuntimeSource: before.notificationRuntime,
    })
  );
  attempt('identity', () =>
    deriveM4IdentitySource({
      verifierSource: before.verifier,
      userSchemaSource: before.userSchema,
      sessionSource: before.session,
      sharedAuthPackageSource: before.resolver,
    })
  );
  attempt('assignmentKernels', () =>
    deriveM4AssignmentKernels({
      sharedSource: before.kernelShared,
      legacySource: before.legacyKernel,
      staffSource: before.staffKernel,
    })
  );
  attempt('privateRuntime', () =>
    deriveM4PrivateRuntimeSource({
      bootstrapSource: before.bootstrap,
      contextSource: before.context,
      postureSource: before.posture,
      runtimeTypesSource: before.runtimeTypes,
      controllerTypesSource: before.controllerTypes,
    })
  );
  attempt('mountedAssignment', () =>
    deriveM4MountedSource(
      Object.fromEntries(
        mountedContract.files.map(row => {
          const role = Object.keys(files).find(key => files[key] === row.file);
          if (!role) fail('fixed mounted file is outside source closure');
          return [row.file, before[role]];
        })
      ),
      mountedContract
    )
  );
  const after = read();
  if (canonical(before) !== canonical(after)) fail('source changed during derivation');
  const receipt = freeze({
    id: contract.id,
    files: Object.values(files),
    policyDigest: digest(canonical(contract)),
    sourceRecords: structuredClone(contract.sources),
    bookends: {
      before: digest(canonical(before)),
      after: digest(canonical(after)),
    },
    sourceBindingAuthenticated: true,
    checkerAttempts: [
      'kernel',
      'controller',
      'notification',
      'identity',
      'assignmentKernels',
      'privateRuntime',
      'mountedAssignment',
    ],
    derivations,
    failures,
    sourcePremiseOnly: true,
    bootstrapAndPosture: 'finite source/control derived; executed runtime premises remain required',
    additionalSourceBoundOnlyFiles: mountedContract.files
      .filter(row => !row.executionRequired)
      .map(row => row.file),
    additionalSourceBoundOnlyGuarantee:
      'All fixed modules have finite source derivations, including erased type contracts; no complete-runtime or native admission is inferred.',
    runtimeAdmission: false,
    allExecutableContextsQualified: false,
    productionEventAuthenticated: false,
    requiredProofs: [
      'immutable producer distribution and authenticated event/source/policy join',
      'actual complete native inventory and all executable contexts',
      'executed role/current-store/bootstrap and caller qualification',
      'actual SQL qualification of kernel and bootstrap/purpose-pool premises, with independent current-store, driver, TLS and imported notifier/transport qualification',
      'native authenticated semantic-negative rejection',
    ],
  });
  if (failures.length) {
    const error = Error(
      'incomplete: m4 authenticated semantic rejection: ' + failures.map(x => x.reason).join('; ')
    );
    Object.defineProperty(error, 'receipt', {
      value: receipt,
      enumerable: true,
    });
    rejected.add(error);
    throw error;
  }
  authenticated.add(receipt);
  models.set(receipt, { model, root });
  return receipt;
}

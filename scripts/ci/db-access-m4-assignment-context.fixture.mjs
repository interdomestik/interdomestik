import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
export const P = path.resolve(import.meta.dirname, '../..');

export const proposed = name => import(new URL(name, import.meta.url));

export const read = file => fs.readFileSync(path.join(P, file), 'utf8'),
  hash = text => createHash('sha256').update(text).digest('hex');

export const bootstrap = read('apps/web/src/server/operations/m4-private-runtime.ts');

export const primitive = await proposed('db-access-m4-assignment-primitive-semantics.mjs');

export const { ASSIGNMENT_PRIMITIVES } = await proposed(
  'db-access-m4-assignment-primitive-contract.mjs'
);

export const { deriveM4AssignmentKernel } = await proposed('db-access-m4-source.mjs');

export const { deriveM4AssignmentControllers } = await proposed(
  'db-access-m4-four-controller-source.mjs'
);

export const { deriveM4AssignmentKernels } = await proposed(
  'db-access-m4-assignment-kernels-source.mjs'
);

export const { deriveM4PrivateRuntimeSource } = await proposed('db-access-m4-runtime-source.mjs');

export const proof = await proposed('db-access-m4-assignment-context-proof.mjs');

export const runtimeSources = {
  bootstrapSource: bootstrap,
  contextSource: fs.readFileSync(
    new URL('../../apps/web/src/server/operations/m4-private-runtime-context.ts', import.meta.url),
    'utf8'
  ),
  postureSource: read('apps/web/src/server/operations/m4-pool-posture.ts'),
  runtimeTypesSource: read('apps/web/src/server/operations/m4-private-runtime-types.ts'),
  controllerTypesSource: read('apps/web/src/server/operations/m4-assignment-controller-types.ts'),
};

export const controllerSources = {
  controllerSource: read('apps/web/src/server/operations/m4-ops-controller.ts'),
  wireSource: read('apps/web/src/server/operations/m4-assignment-wire.ts'),
  protocolSource: read('apps/web/src/server/operations/m4-assignment-protocol.ts'),
};

export const familySources = {
  sharedSource: read('apps/web/src/server/operations/m4-assignment-kernel-shared.ts'),
  legacySource: read('apps/web/src/server/operations/m4-legacy-assignment-kernel.ts'),
  staffSource: read('apps/web/src/server/operations/m4-staff-assignment-kernel.ts'),
};

export const kernel = deriveM4AssignmentKernel(
    read('apps/web/src/features/admin/claims/actions/ops-assignment.ts')
  ),
  controller = deriveM4AssignmentControllers(controllerSources),
  family = deriveM4AssignmentKernels(familySources),
  privateRuntime = deriveM4PrivateRuntimeSource(runtimeSources);

export function mockBootstrap(
  source = bootstrap,
  { gate, throwController = false, notificationCloseGate } = {}
) {
  const factories = [],
    postgres = () => ({ end: async () => {} }),
    drizzle = pool => ({ pool });
  const factory = name => configuration => {
    factories.push({ name, configuration });
    return async () => {
      if (gate) await gate;
      if (throwController) throw Error('explicit unit controller throw');
      return { status: 'completed', result: { success: true } };
    };
  };
  const protocol = { exports: {} };
  new Function(
    'module',
    'exports',
    ts.transpileModule(controllerSources.protocolSource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
  )(protocol, protocol.exports);
  const mocks = {
    'node:crypto': { createHash },
    '@interdomestik/database/schema': {},
    'drizzle-orm/postgres-js': { drizzle },
    postgres: { default: postgres },
    '../../lib/auth/current-store-session': {
      createCurrentStoreSessionVerifier: () => async () => null,
    },
    './m4-assignment-protocol': protocol.exports,
    './m4-assignment-wire': { parseM4AssignmentObservation: () => ({ ip: null, userAgent: null }) },
    './m4-assignment-postcommit': { createM4AssignmentPostcommitNotifier: () => () => {} },
    './m4-notification-runtime': {
      createM4NotificationDatabaseOwner: () => ({
        open: () => {},
        close: async () => {
          if (notificationCloseGate) await notificationCloseGate;
        },
      }),
    },
    './m4-pool-posture': {
      assertM4DriverEnvironment() {},
      assertM4PoolPosture: async () => {},
      captureM4PoolTarget: url => ({
        url,
        login: new URL(url).username,
        serverKey: 'explicit-unit-endpoint',
      }),
    },
    './m4-ops-controller': {
      createM4OpsAssignmentController: factory('ops'),
      createM4StaffAssignmentController: factory('staff'),
      createM4LegacyAdminAssignmentController: factory('legacy-admin'),
      createM4LegacyAgentAssignmentController: factory('legacy-agent'),
    },
  };
  const helper = fs.readFileSync(
    new URL('../../apps/web/src/server/operations/m4-private-runtime-context.ts', import.meta.url),
    'utf8'
  );
  const helperModule = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(helper, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
  )(name => mocks[name], helperModule, helperModule.exports);
  mocks['./m4-private-runtime-context'] = helperModule.exports;
  const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    name => {
      assert(Object.hasOwn(mocks, name), name);
      return mocks[name];
    },
    module,
    module.exports
  );
  return { api: module.exports, factories, context: helperModule.exports };
}

export const configuration = {
  identityDatabaseURL: 'postgresql://explicit_unit_identity:x@127.0.0.1/test',
  dataDatabaseURL: 'postgresql://explicit_unit_data:x@127.0.0.1/test',
  issuerBaseURL: 'https://explicit-unit.invalid',
  issuerSecret: 'x'.repeat(32),
  operationDeadlineMs: 1000,
  notificationDatabaseURL: 'postgresql://explicit_unit_notification:x@127.0.0.1/test',
  notificationDatabaseDeadlineMs: 1000,
};

export const command = profile =>
  JSON.stringify({
    version: 1,
    command:
      profile === 'ops'
        ? 'm4.ops.assign-owner'
        : profile === 'staff'
          ? 'm4.staff.assign-claim'
          : 'm4.legacy.assign-claim',
    operationId: '00000000-0000-4000-8000-000000000001',
    claimId: 'explicit-unit-claim',
    staffId: 'explicit-unit-staff',
  });

export async function executeFamily(fixture) {
  const runtime = fixture.api.createM4LocalQualificationAssignmentRuntime(configuration);
  for (const [method, profile] of [
    ['execute', 'ops'],
    ['executeStaff', 'staff'],
    ['executeLegacyAdmin', 'legacy-admin'],
    ['executeLegacyAgent', 'legacy-agent'],
  ])
    await runtime[method]('unit', command(profile), '{}');
  await runtime.close();
  return { runtime, record: fixture.api.takeM4OwnedAssignmentContexts(runtime) };
}

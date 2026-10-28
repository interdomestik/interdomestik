// Pure fixed-source derivation. This is neither a runtime owner nor acceptance authority.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { exact } from './db-access-provider-runtime-identity.mjs';
import fixed from './db-access-m4-compiled-contract.json' with { type: 'json' };

const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
freeze(fixed);
const helperNames = Object.freeze([
  'scripts/ci/m4-compiled-fixture/package-graph.mjs',
  'scripts/ci/m4-compiled-fixture/preparation-custody.mjs',
  'scripts/ci/m4-compiled-fixture/prepare-build.mjs',
  'scripts/ci/m4-compiled-fixture/seal-build.mjs',
  'scripts/ci/m4-compiled-fixture/source-bookends.mjs',
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => {
  throw Error('M4 compiled fixture source refused: ' + reason);
};
const canonicalRoot = root => {
  if (typeof root !== 'string' || !path.isAbsolute(root) || fs.realpathSync(root) !== root)
    fail('physical source root');
  return root;
};
function collect(root, records) {
  return Object.fromEntries(
    Object.entries(records).map(([file, descriptor]) => {
      const bytes = exact(root, file, descriptor);
      return [file, bytes];
    })
  );
}
// Closed program, independent of descriptor input. Printer comparison admits whitespace,
// comments and quote style while retaining every executable AST construct and binding.
const expectedActionProgram =
  "'use server';\nimport { headers } from 'next/headers';\nimport { executeM4QualificationAdminAssignment } from '@/server/operations/m4-qualification-admin-assignment';\nimport { executeM4QualificationAgentAssignment } from '@/server/operations/m4-qualification-agent-assignment';\nimport { executeM4QualificationStaffAssignment } from '@/server/operations/m4-qualification-staff-assignment';\nimport { invalid, settled, uncertain } from './action-input';\nimport { qualificationInput } from './fixture-scope';\n\nexport async function runAdminAssignment(_previous, form) {\n  const input = qualificationInput(form, 'legacy-admin');\n  if (!input) return invalid();\n  try {\n    const requestHeaders = await headers();\n    return settled(\n      input,\n      await executeM4QualificationAdminAssignment({ ...input, requestHeaders })\n    );\n  } catch {\n    return uncertain(input);\n  }\n}\nexport async function runAgentAssignment(_previous, form) {\n  const input = qualificationInput(form, 'legacy-agent');\n  if (!input) return invalid();\n  try {\n    const requestHeaders = await headers();\n    return settled(\n      input,\n      await executeM4QualificationAgentAssignment({ ...input, requestHeaders })\n    );\n  } catch {\n    return uncertain(input);\n  }\n}\nexport async function runStaffAssignment(_previous, form) {\n  const input = qualificationInput(form, 'staff');\n  if (!input) return invalid();\n  try {\n    const requestHeaders = await headers();\n    return settled(\n      input,\n      await executeM4QualificationStaffAssignment({ ...input, requestHeaders })\n    );\n  } catch {\n    return uncertain(input);\n  }\n}\n";
const actionFile = 'scripts/ci/m4-compiled-fixture/project/app/actions.js';
function normalizedProgram(unit) {
  const transformed = ts.transform(unit, [
    context => root => {
      const visit = node =>
        ts.isStringLiteral(node)
          ? ts.factory.createStringLiteral(node.text)
          : ts.visitEachChild(node, visit, context);
      return ts.visitNode(root, visit);
    },
  ]);
  try {
    return ts.createPrinter({ removeComments: true }).printFile(transformed.transformed[0]);
  } finally {
    transformed.dispose();
  }
}
const parseActions = text =>
  ts.createSourceFile(actionFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const expectedActions = parseActions(expectedActionProgram);
const expectedNormalizedProgram = normalizedProgram(expectedActions);
function actionFacts(bytes) {
  const unit = parseActions(bytes.toString('utf8'));
  if (unit.parseDiagnostics.length || normalizedProgram(unit) !== expectedNormalizedProgram)
    fail('closed server-action program');
  const functions = unit.statements.filter(ts.isFunctionDeclaration);
  const expectedFacts = [
    {
      name: 'runAdminAssignment',
      profile: 'legacy-admin',
      adapter: 'executeM4QualificationAdminAssignment',
    },
    {
      name: 'runAgentAssignment',
      profile: 'legacy-agent',
      adapter: 'executeM4QualificationAgentAssignment',
    },
    {
      name: 'runStaffAssignment',
      profile: 'staff',
      adapter: 'executeM4QualificationStaffAssignment',
    },
  ];
  if (JSON.stringify(fixed.actions) !== JSON.stringify(expectedFacts) || functions.length !== 3)
    fail('exact action facts');
  return fixed.actions.map((spec, index) => {
    const fn = functions[index];
    if (fn.name?.text !== spec.name) fail('literal asynchronous action');
    return {
      name: spec.name,
      profile: spec.profile,
      adapter: spec.adapter,
      locator: [actionFile, fn.pos, fn.end, fn.kind],
      bodySha256: hash(fn.body.getText(unit)),
    };
  });
}
export function deriveM4CompiledFixtureSource({ producerRoot, candidateRoot }) {
  const producer = canonicalRoot(producerRoot),
    candidate = canonicalRoot(candidateRoot);
  if (
    fixed.version !== 1 ||
    fixed.kind !== 'fixed-compiled-fixture-source-inputs' ||
    fixed.runtimeAdmission !== false ||
    fixed.productionCCredit !== 0 ||
    fixed.browserBinaryBound !== false
  )
    fail('fixed source-only contract');
  if (
    JSON.stringify(Object.keys(fixed.producerHelpers).sort()) !==
      JSON.stringify([...helperNames].sort()) ||
    Object.keys(fixed.projectFiles).length !== 32 ||
    Object.keys(fixed.candidateFiles).length !== 13 ||
    fixed.vendorCorrespondence.length !== 8
  )
    fail('finite fixed source membership');
  collect(producer, fixed.producerHelpers);
  const project = collect(producer, fixed.projectFiles),
    candidateFiles = collect(candidate, fixed.candidateFiles);
  for (const row of fixed.vendorCorrespondence) {
    if (
      !project[row.producer] ||
      !candidateFiles[row.candidate] ||
      !project[row.producer].equals(candidateFiles[row.candidate])
    )
      fail('exact candidate vendor correspondence');
  }
  const actionFile = 'scripts/ci/m4-compiled-fixture/project/app/actions.js';
  const actions = actionFacts(project[actionFile]);
  return Object.freeze({
    version: 1,
    kind: 'fixed-compiled-fixture-source-observation',
    contractSha256: hash(JSON.stringify(fixed)),
    actions: Object.freeze(actions.map(Object.freeze)),
    projectFileCount: Object.keys(project).length,
    candidateFileCount: Object.keys(candidateFiles).length,
    installedClosureSha256: fixed.installedClosure.sha256,
    browserBinaryBound: false,
    runtimeAdmission: false,
    nativeAdmission: false,
    productionCCredit: 0,
  });
}

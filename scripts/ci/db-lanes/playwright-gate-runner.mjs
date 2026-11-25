import ts from 'typescript';
import { createParser, textOf, topLevelDeclarations } from '../server-mutation/ast.mjs';

const gateDispatch =
  'await runPlaywright( laneName, [...pwArgs, ...lane.playwrightArgs, ...extraPlaywrightArgs], finalEnv );';
const declarations = [
  'const reportArgs = playwrightReportArgs(process.env.PW_EVIDENCE_LANE);',
  "const strictArgs = ['--max-failures=1', ...reportArgs];",
  "const strictWorkers = ['--workers=1', ...strictArgs];",
  "const localMac = process.platform === 'darwin' && process.env.GITHUB_ACTIONS !== 'true';",
  'const fullGateWorkers = localMac ? localMacGateArgs(10) : strictWorkers;',
  'const stateRunnerArgs = localMac ? localMacGateArgs(1) : strictWorkers;',
  "const gatePaths = ['e2e/gate', 'e2e/security'];",
  "const pwArgs = ['--filter', '@interdomestik/web', 'exec', 'playwright', 'test'];",
  "const ksSq = '--project=gate-ks-sq';",
  "const mkMk = '--project=gate-mk-mk';",
  'const gateLane = (projects, state = false, runnerArgs = strictWorkers) => ({ ' +
    'gatekeeper: true, state, env: fastEnv, playwrightArgs: [...gatePaths, ...runnerArgs, ...projects], });',
  "const laneName = process.argv.length > 2 ? process.argv[2] : 'gate';",
  'const extraPlaywrightArgs = process.argv.slice(3);',
  'const lane = laneDefinitions[laneName];',
  "const keepPilotMk = (laneName === 'pr' || laneName === 'pr-fast') && " +
    "extraPlaywrightArgs.some(arg => arg.includes('/pilot/'));",
];

const knownUses = new Set([
  ...declarations,
  "const workerArgs = ['--workers=1', ...reportArgs];",
  "const lanes = Object.keys(laneDefinitions).join(', ');",
  'if (!lane) { usage(); process.exit(2); }',
  'if (keepPilotMk) lane.playwrightArgs.push(mkMk);',
  'await runPlaywright(laneName, [...lane.pnpmArgs, ...extraPlaywrightArgs], process.env);',
  "const shouldRunLocalDoctor = lane.gatekeeper && process.env.SKIP_DOCKER_DOCTOR !== '1' && " +
    "process.env.CI !== 'true' && !process.env.E2E_DATABASE_URL;",
  'const laneEnv = lane.env ? { ...baseEnv, ...lane.env } : baseEnv;',
  "if (lane.gatekeeper) await run('bash', ['scripts/m4-gatekeeper.sh'], laneEnv);",
  "if (lane.state) { await runPlaywright('state', [...pwArgs, ...laneDefinitions.state.playwrightArgs], stateEnv); }",
  gateDispatch,
]);

const copiedArguments = new Set([
  'gatePaths',
  'reportArgs',
  'strictArgs',
  'strictWorkers',
  'stateRunnerArgs',
]);
const protectedInputs = new Set([
  ...copiedArguments,
  'extraPlaywrightArgs',
  'fullGateWorkers',
  'keepPilotMk',
  'lane',
  'laneDefinitions',
  'pwArgs',
]);

function hasUnknownUse(node, laneDefinitions, gate, dispatch) {
  if (node === laneDefinitions) node = node.initializer;
  if (node === gate || (ts.isStatement(node) && knownUses.has(textOf(node)))) return false;
  // The other lanes can copy these arrays. Passing the array itself could let a callee mutate it.
  if (
    ts.isSpreadElement(node) &&
    ts.isArrayLiteralExpression(node.parent) &&
    ts.isIdentifier(node.expression) &&
    copiedArguments.has(node.expression.text)
  ) {
    return false;
  }
  if (ts.isIdentifier(node) && protectedInputs.has(node.text)) return true;
  return Boolean(
    ts.forEachChild(node, child =>
      child !== dispatch.expression && hasUnknownUse(child, laneDefinitions, gate, dispatch)
        ? true
        : undefined
    )
  );
}

// Use the runner source as evidence. An unexplained use can change what Playwright selects.
export function provesHostedGateArguments(root) {
  const runner = createParser(root)('scripts/run-e2e-lane.mjs');
  if (!runner) return false;
  const statements = new Set(runner.statements.map(textOf));
  if (!declarations.every(statement => statements.has(statement))) return false;

  const bindings = topLevelDeclarations(runner);
  const laneDefinitions = bindings.get('laneDefinitions');
  const lanes = laneDefinitions?.initializer;
  if (
    !lanes ||
    !ts.isObjectLiteralExpression(lanes) ||
    !lanes.properties.every(
      property =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    )
  ) {
    return false;
  }
  const gates = lanes.properties.filter(property => property.name.text === 'gate');
  if (
    gates.length !== 1 ||
    textOf(gates[0]) !== 'gate: gateLane([ksSq, mkMk], true, fullGateWorkers)'
  ) {
    return false;
  }

  const dispatch = runner.statements.at(-1);
  const hostedBranch = bindings.get('runPlaywright')?.body?.statements[0];
  const fullGate = dispatch?.elseStatement?.statements?.at(-1);
  if (
    !ts.isIfStatement(dispatch) ||
    textOf(dispatch.expression) !== 'lane.pnpmArgs' ||
    !fullGate ||
    textOf(fullGate) !== gateDispatch ||
    !hostedBranch ||
    textOf(hostedBranch) !==
      "if (!localMac || !['state', 'gate', 'smoke'].includes(name)) { return run('pnpm', args, env); }"
  ) {
    return false;
  }
  return !hasUnknownUse(runner, laneDefinitions, gates[0], dispatch);
}

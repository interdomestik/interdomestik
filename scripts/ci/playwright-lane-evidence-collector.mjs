const TEST_OUTCOMES = new Set(['skipped', 'expected', 'unexpected', 'flaky']);
const RESULT_OUTCOMES = new Set(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);

function fail(code) {
  throw new Error(code);
}

function validateConfiguredProjects(configured) {
  if (!Array.isArray(configured)) return;
  const names = configured.map(project => project?.name);
  if (names.some(name => typeof name !== 'string') || new Set(names).size !== names.length) {
    fail('PROJECT_DUPLICATE');
  }
}

function collectTest(currentTest, specFile, specProjects, state) {
  const project = currentTest?.projectName;
  if (typeof project !== 'string' || !state.safeName.test(project)) fail('PROJECT_INVALID');
  if (specProjects.has(project)) fail('PROJECT_DUPLICATE');
  specProjects.add(project);
  state.projects.add(project);
  if (!TEST_OUTCOMES.has(currentTest.status)) fail('OUTCOME_INVALID');
  if (!RESULT_OUTCOMES.has(currentTest.expectedStatus)) fail('OUTCOME_INVALID');
  if (!Array.isArray(currentTest.results)) fail('OUTCOME_INVALID');
  for (const result of currentTest.results) {
    if (!RESULT_OUTCOMES.has(result?.status)) fail('OUTCOME_INVALID');
  }
  if (currentTest.status === 'unexpected') state.failed = true;
  if (currentTest.results.length > 1 && currentTest.results.at(-1)?.status === 'passed') {
    state.retryRecovered.add(specFile);
  }
  state.total += 1;
}

function collectSpec(spec, state) {
  if (!spec || typeof spec !== 'object' || typeof spec.id !== 'string' || !spec.id) {
    fail('SPEC_INVALID');
  }
  if (state.specIds.has(spec.id)) fail('SPEC_DUPLICATE');
  state.specIds.add(spec.id);
  const specFile = state.safeSpec(spec.file);
  state.specs.add(specFile);
  if (!Array.isArray(spec.tests) || spec.tests.length === 0) fail('SPEC_INVALID');
  const quarantined = spec.tags?.some(
    tag => typeof tag === 'string' && tag.replace(/^@/u, '') === 'quarantine'
  );
  if (quarantined) state.quarantined.add(specFile);
  const specProjects = new Set();
  for (const currentTest of spec.tests) collectTest(currentTest, specFile, specProjects, state);
}

function collectSuite(suite, state) {
  if (!suite || typeof suite !== 'object' || !Array.isArray(suite.specs)) {
    fail('SUITES_INVALID');
  }
  for (const spec of suite.specs) collectSpec(spec, state);
  if (suite.suites !== undefined && !Array.isArray(suite.suites)) fail('SUITES_INVALID');
  for (const nested of suite.suites ?? []) collectSuite(nested, state);
}

export function collectReportEvidence(parsed, { safeName, safeSpec }) {
  if (!Array.isArray(parsed?.suites) || parsed.suites.length === 0) fail('SUITES_INVALID');
  validateConfiguredProjects(parsed?.config?.projects);
  const state = {
    safeName,
    safeSpec,
    projects: new Set(),
    specs: new Set(),
    specIds: new Set(),
    retryRecovered: new Set(),
    quarantined: new Set(),
    total: 0,
    failed: Array.isArray(parsed.errors) && parsed.errors.length > 0,
  };
  for (const suite of parsed.suites) collectSuite(suite, state);
  if (state.total === 0) fail('REPORT_EMPTY');
  return state;
}

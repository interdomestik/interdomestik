import assert from 'node:assert/strict';

import { REG, W, adopted, scan } from './cli-fixtures.mjs';
import { commit } from './harness.mjs';

const SAVE = `${W}/actions/consent.ts`;
const ACTIONS =
  "'use server';\nexport async function saveTerms() {}\nexport async function saveDraft() {}\nexport async function saveMarketing() {}\n";
export const PAGE = `${W}/app/signup/page.tsx`;
const errorsOf = result => (result.report?.errors ?? []).join('\n');

// An adopted repository (fixture baseline, empty registry) with `headFiles` committed on top, and
// the production CLI's verdict on that pair.
export function judgeHead(t, headFiles, baseFiles = {}, extraArgs = []) {
  const { root, base } = adopted(t, undefined, baseFiles);
  const head = commit(root, headFiles);
  return { root, base, head, ...scan(t, root, [...extraArgs, '--base', base, '--head', head]) };
}

export const okRun = result => {
  assert.equal(result.code, 0, errorsOf(result));
  assert.deepEqual(result.report.errors, []);
  return result.report.checks;
};

// The fields of each kind a use's test must name (registry.mjs, REQUIRED_BY_KIND).
const KIND_FIELDS = Object.freeze({
  consent: { payloadField: 'acceptTerms', storedIn: 'consents', versionSource: 'TERMS_VERSION' },
  selection: { selectedRecord: 'selectedPlanId', storedIn: 'plans' },
});

export const entryOf = ({
  id,
  kind = 'consent',
  file,
  control,
  useId,
  useFile,
  action,
  testFile,
  more,
}) => ({
  id,
  kind,
  file,
  control,
  ...KIND_FIELDS[kind],
  uses: [{ useId, file: useFile, submission: `${SAVE}#${action}`, test: testFile }],
  ...more,
});

// A use test that holds every piece of evidence: it imports and calls the submission and names the
// entry, the use, the fields of its kind and (for consent) a time field.
function evidenceText(entry, omit = null) {
  const use = entry.uses[0];
  const action = use.submission.split('#')[1];
  const names = [entry.id, use.useId, ...Object.values(KIND_FIELDS[entry.kind]), 'acceptedAt'];
  const said = names.filter(name => name !== omit).join(' ');
  return `import { ${action} } from '@/actions/consent';\nit('${said}', async () => {\n  await ${action}();\n});\n`;
}

export const registryFiles = (entries, omit = null) => ({
  [SAVE]: ACTIONS,
  [REG]: `${JSON.stringify({ version: 1, entries }, null, 2)}\n`,
  ...Object.fromEntries(entries.map(entry => [entry.uses[0].test, evidenceText(entry, omit)])),
});

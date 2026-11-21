import { ids, lint } from './harness.mjs';

export const W = 'apps/web/src';
export const REG = 'scripts/ci/screen-contract-consent-registry.json';
const SAVE = `${W}/actions/consent.ts`;
const ACTIONS = `'use server';\nexport async function saveTerms() {}\nexport async function saveDraft() {}\nexport async function saveMarketing() {}\nexport async function saveToggle() {}\n`;
export const registry = entries => JSON.stringify({ version: 1, entries });
export const use = (useId, file, name = 'saveTerms') => ({
  useId,
  file,
  submission: `${SAVE}#${name}`,
  test: `${W}/x.test.ts`,
});
export const consent = (id, file, control, uses, extra = {}) => ({
  id,
  kind: 'consent',
  file,
  control,
  payloadField: 'acceptTerms',
  storedIn: 'consents',
  versionSource: 'TERMS_VERSION',
  uses,
  ...extra,
});
// Every lint needs a screen (code-r2: a check with no expected file is an input error).
export const base = files => ({
  [`${W}/app/home/page.tsx`]: 'export default () => null;\n',
  [SAVE]: ACTIONS,
  [`${W}/messages/en/app.json`]: JSON.stringify({
    signup: { terms: 'I agree', neutral: 'Box one', sneaky: 'I accept the terms' },
  }),
  ...files,
});
export const chk22 = async root => ids(await lint(root), 'CHK-22');
export const PAGE = `${W}/app/signup/page.tsx`;
export const head = "import { saveTerms, saveDraft, saveMarketing } from '@/actions/consent';\n";

export const SHARED = 'packages/ui/src/components/consent-box.tsx';
export const SHARED_FILES = {
  [SHARED]:
    'export function ConsentBox() { return <input type="checkbox" id="terms" data-consent="terms" />; }\n',
  'packages/ui/src/index.ts':
    "export * from './components/button';\nexport { ConsentBox } from './components/consent-box';\n",
};

// An exported control needs a use (r5 B2): a caller with its own marked form, so the tests below
// judge only the renders they are about.
export const CALLER = `${W}/app/c/page.tsx`;
export const CALLER_FILES = {
  'packages/ui/src/index.ts': SHARED_FILES['packages/ui/src/index.ts'],
  [CALLER]: `${head}import { ConsentBox } from '@interdomestik/ui';\nexport default function C() { return <form action={saveTerms} data-consent-use="terms:c"><ConsentBox /></form>; }\n`,
};
export const usedShared = () =>
  registry([consent('terms', SHARED, 'terms', [use('c', CALLER)], { exportName: 'ConsentBox' })]);

export const signupReg = () => registry([consent('terms', PAGE, 'terms', [use('signup', PAGE)])]);
export const CONTROL = '<input type="checkbox" id="terms" data-consent="terms" />';

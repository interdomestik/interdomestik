import { parseRegistry, readLanes, testEvidence } from '../../screen-contract/registry.mjs';
import { W } from './cli-fixtures.mjs';
import { tree } from './harness.mjs';

export const ACTION = `${W}/actions/terms.ts`;
const PLAYWRIGHT =
  "const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];\nconst GATE_KS = [...GATE_DEFAULT_MATCH, 'security/a.spec.ts'];\nexport default defineConfig({ testDir: './e2e', projects: [{ name: 'gate-ks-sq', testMatch: GATE_KS }, { name: 'gate-mk-contract', testMatch: GATE_DEFAULT_MATCH }, { name: 'visual', testMatch: ['visual/**/*.spec.ts'] }] });\n";
const VITEST =
  "export default { test: { include: ['src/**/*.test.{ts,tsx}'], exclude: ['node_modules', 'src/legacy/**'] } };\n";

export const registryWith = (testFile, exportName = 'saveTerms') =>
  parseRegistry(
    JSON.stringify({
      version: 1,
      entries: [
        {
          id: 'terms',
          kind: 'consent',
          file: `${W}/app/signup/page.tsx`,
          control: 'terms',
          payloadField: 'termsAccepted',
          storedIn: 'consents',
          versionSource: 'TERMS_VERSION',
          uses: [
            {
              useId: 'signup',
              file: `${W}/app/signup/page.tsx`,
              submission: `${ACTION}#${exportName}`,
              test: testFile,
            },
          ],
        },
      ],
    })
  );

export const BODY = [
  "it('terms signup stores termsAccepted in consents with TERMS_VERSION and acceptedAt', async () => {",
  '  await saveTerms({ termsAccepted: true });',
  '});',
  '',
].join('\n');
export const IMPORTING = `import { saveTerms } from '@/actions/terms';\n${BODY}`;

export function evidence(t, testFile, text, lanes = {}, exportName = 'saveTerms') {
  const root = tree(t, {
    'apps/web/vitest.config.ts': VITEST,
    'apps/web/playwright.config.ts': PLAYWRIGHT,
    [ACTION]: "'use server';\nexport async function saveTerms() {}\n",
    [testFile]: text,
    ...lanes,
  });
  return testEvidence(root, registryWith(testFile, exportName), readLanes(root));
}

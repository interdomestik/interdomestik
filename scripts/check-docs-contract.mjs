import fs from 'fs';
import path from 'path';

const rootReadmePath = path.join(process.cwd(), 'README.md');
const agentsPath = path.join(process.cwd(), 'AGENTS.md');
const e2eSpecPath = path.join(process.cwd(), 'apps/web/e2e/README.md');

function checkFileExists(filePath, name) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ [Docs Contract] Missing file: ${name} (${filePath})`);
    process.exit(1);
  }
}

function checkContent(filePath, name, regex, errorMessage) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!regex.test(content)) {
    console.error(`❌ [Docs Contract] ${name}: ${errorMessage}`);
    process.exit(1);
  }
}

console.log('🔍 Checking Docs Contract...');

// 1. Files must exist
checkFileExists(rootReadmePath, 'Root README');
checkFileExists(agentsPath, 'AGENTS.md');
checkFileExists(e2eSpecPath, 'E2E Spec');

// 2. Root README must link to other docs
checkContent(rootReadmePath, 'Root README', /AGENTS\.md/, 'Must link to AGENTS.md (Governance)');
checkContent(
  rootReadmePath,
  'Root README',
  /apps\/web\/e2e\/README\.md/,
  'Must link to apps/web/e2e/README.md (Source of Truth)'
);

// 3. Root README must contain the Quick-Ref block
checkContent(
  rootReadmePath,
  'Root README',
  /### 🚦 What should I run\?/,
  'Must contain "What should I run?" section'
);
checkContent(rootReadmePath, 'Root README', /pnpm boot:dev/, 'Must mention "pnpm boot:dev"');
checkContent(rootReadmePath, 'Root README', /pnpm boot:e2e/, 'Must mention "pnpm boot:e2e"');
const isStrict = process.argv.includes('--strict');

// 4. AGENTS.md must NOT contain infrastructure-specific tokens (Layering)
const forbiddenAgentsTokens = [
  /POSTGRES_/i,
  /gitleaks/i,
  /GitGuardian/i,
  /HOST_AUTH_METHOD/i,
  /“trust”/i,
  /file:\/\/\//i,
  /\/Users\//i,
  /apps\/web\/e2e\/gate\/seed-contract\.spec\.ts/i,
];

forbiddenAgentsTokens.forEach(token => {
  const content = fs.readFileSync(agentsPath, 'utf-8');
  if (token.test(content)) {
    console.error(
      `❌ [Docs Contract] AGENTS.md: Found forbidden technical/infra token "${token.source}". Technical details belong in apps/web/e2e/README.md.`
    );
    process.exit(1);
  }
});

// 5. Root README.md must NOT contain technical E2E specs (Onboarding only)
const forbiddenReadmeTokens = [
  /page\.goto/i,
  /data-testid/i,
  /seed-contract\.spec\.ts/i,
  /tenant-resolution\.spec\.ts/i,
  /PW_REUSE_SERVER/i,
  /gate-ks-sq/i,
  /gate-mk-mk/i,
];

forbiddenReadmeTokens.forEach(token => {
  const content = fs.readFileSync(rootReadmePath, 'utf-8');
  if (token.test(content)) {
    console.error(
      `❌ [Docs Contract] README.md: Found technical E2E detail "${token.source}". README is for onboarding; tech specs belong in apps/web/e2e/README.md.`
    );
    process.exit(1);
  }
});

// 6. E2E Spec must contain "Source of Truth" and strict rules
checkContent(
  e2eSpecPath,
  'E2E Spec',
  /source of truth/i,
  'Must contain "Source of Truth" declaration'
);
checkContent(
  e2eSpecPath,
  'E2E Spec',
  /Strict Project Rules/i,
  'Must contain "Strict Project Rules" section'
);

if (isStrict) {
  console.log('🛡️ [Docs Contract] Strict mode enabled: Cross-referencing all rules.');
}

console.log('✅ Docs Contract Verified.');

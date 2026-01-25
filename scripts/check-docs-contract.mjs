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

console.log('✅ Docs Contract Verified.');

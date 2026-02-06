// scripts/verify-v3-docs.mjs
import fs from 'node:fs';
import path from 'node:path';

const README_PATH = path.join(process.cwd(), 'README.md');
const ARCH_PATH = path.join(process.cwd(), 'docs', 'ARCHITECTURE.md');

const REQUIRED_PATTERNS = [
  { file: 'README.md', pattern: /Next\.js 15/, message: 'Must specify Next.js 15' },
  {
    file: 'README.md',
    pattern: /Paddle \(V3 only\)/,
    message: 'Must specify Paddle as V3 payment provider',
  },
  { file: 'README.md', pattern: /proxy\.ts/, message: 'Must reference proxy.ts' },
  {
    file: 'docs/ARCHITECTURE.md',
    pattern: /Phase C \(Pilot Delivery\)/,
    message: 'Architecture doc must specify Phase C Status',
  },
];

let hasError = false;

console.log('🔒 Verifying V3 Documentation Locks...');

for (const req of REQUIRED_PATTERNS) {
  const filePath = req.file === 'README.md' ? README_PATH : ARCH_PATH;

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing file: ${req.file}`);
    hasError = true;
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  if (!req.pattern.test(content)) {
    console.error(`❌ ${req.file} Failed Lock: ${req.message}`);
    hasError = true;
  } else {
    console.log(`✅ ${req.file}: Verified ${req.pattern}`);
  }
}

if (hasError) {
  console.error('\n🚫 Documentation verification failed. Critical V3 definitions are missing.');
  process.exit(1);
}

console.log('\n✨ All Documentation Locks Verified.');
process.exit(0);

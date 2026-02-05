import fs from 'fs';
import path from 'path';

const LOCKFILE_PATH = 'pnpm-lock.yaml';

// Define banned versions/patterns
// Format: { name: 'package-name', banned: [/regex1/, /regex2/], reason: '...' }
const BANNED_PACKAGES = [
  {
    name: 'tar',
    banned: [/@7\.5\.[0-6](?!\d)/, /@6\./, /@5\./],
    reason: 'CVE-2024-37890 / High severity vulnerability in versions < 7.5.7'
  },
  {
    name: 'lodash',
    banned: [/@4\.17\.21(?!\d)/, /@4\.17\.[0-9](?!\d)/, /@4\.17\.1[0-9](?!\d)/, /@4\.17\.20(?!\d)/],
    reason: 'Multiple high severity vulnerabilities, use ^4.17.23+'
  },
  {
    name: '@isaacs/brace-expansion',
    banned: [/@5\.0\.0(?!\d)/],
    reason: 'Security vulnerability in 5.0.0, use ^5.0.1+'
  },
  {
    name: 'cross-spawn',
    banned: [/@5\./, /@6\.0\.[0-5](?!\d)/],
    reason: 'Vulnerability in older versions, use ^7.0.6 or 6.0.6+'
  }
];

async function runGuard() {
  if (!fs.existsSync(LOCKFILE_PATH)) {
    console.error(`Error: ${LOCKFILE_PATH} not found.`);
    process.exit(1);
  }

  const content = fs.readFileSync(LOCKFILE_PATH, 'utf-8');
  let foundVulnerabilities = 0;

  console.log('🛡️ Running Security Guard on pnpm-lock.yaml...\n');

  for (const pkg of BANNED_PACKAGES) {
    for (const regex of pkg.banned) {
      // Look for the package in the snapshots or dependencies section
      // In pnpm lockfile 9.0, they usually look like 'pkg@version':
      const searchPattern = new RegExp(`['"]?${pkg.name}${regex.source}['"]?`, 'g');
      const matches = content.match(searchPattern);

      if (matches) {
        foundVulnerabilities++;
        console.error(`❌ BANNED VERSION FOUND: ${matches[0]}`);
        console.error(`   Reason: ${pkg.reason}`);
        console.error(`   Regex Trigger: ${regex.source}\n`);
      }
    }
  }

  if (foundVulnerabilities > 0) {
    console.error(`🚨 Security Guard failed! ${foundVulnerabilities} banned package version(s) detected.`);
    process.exit(1);
  }

  console.log('✅ Security Guard passed. All enforced versions are clean.');
}

runGuard().catch(err => {
  console.error(err);
  process.exit(1);
});
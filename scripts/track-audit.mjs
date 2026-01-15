// track-audit.mjs — Minimal Real Runner
import fs from 'fs';
import { glob } from 'glob';
import yaml from 'js-yaml';

const CONTRACT_PATH = 'docs/delivery-contract.yml';

async function run() {
  console.log('🔍 Tracking Audit: Reading Delivery Contract...');

  if (!fs.existsSync(CONTRACT_PATH)) {
    console.error('❌ Missing docs/delivery-contract.yml');
    process.exit(1);
  }

  const contract = yaml.load(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  console.log(`✅ Loaded contract version: ${contract.version}`);

  let failures = 0;

  // Basic Check Execution Logic
  for (const check of contract.checks || []) {
    if (check.type === 'file_exists') {
      for (const target of check.targets) {
        if (!fs.existsSync(target)) {
          console.error(`❌ Check ${check.id} failed: File not found ${target}`);
          failures++;
        }
      }
    } else if (check.type === 'file_not_exists') {
      for (const target of check.targets) {
        const files = glob.sync(target);
        if (files.length > 0) {
          console.error(`❌ Check ${check.id} failed: Files SHOULD NOT exist: ${files.join(', ')}`);
          failures++;
        }
      }
    } else if (check.type === 'regex') {
      for (const targetPattern of check.targets) {
        const files = glob.sync(targetPattern);

        for (const file of files) {
          if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            const content = fs.readFileSync(file, 'utf8');

            if (check.must_match) {
              for (const pattern of check.must_match) {
                if (!new RegExp(pattern).test(content)) {
                  console.error(
                    `❌ Check ${check.id} failed: ${file} must match regex '${pattern}'`
                  );
                  failures++;
                }
              }
            }
            if (check.must_not_match) {
              for (const pattern of check.must_not_match) {
                if (new RegExp(pattern).test(content)) {
                  console.error(
                    `❌ Check ${check.id} failed: ${file} must NOT match regex '${pattern}'`
                  );
                  failures++;
                }
              }
            }
          }
        }
      }
    }
  }

  if (failures > 0) {
    console.error(`🛑 Audit Failed: ${failures} checks failed.`);
    process.exit(1);
  } else {
    console.log('✅ Audit Passed: All checks green.');
    process.exit(0);
  }
}

run();

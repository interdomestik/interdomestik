// Fixed trusted provisioning/oracle process. Candidate code runs only in the restricted child.
import fs from 'node:fs';
import path from 'node:path';
import { runM4RuntimeFixture } from './db-access-m4-runtime-fixture.mjs';
import { validateM4RuntimeCompletion } from './db-access-m4-runtime-result.mjs';
const root = fs.realpathSync(import.meta.dirname),
  output = path.join(root, 'results');
let report;
try {
  report = await runM4RuntimeFixture({ root, adminURL: process.env.DATABASE_URL, output });
  validateM4RuntimeCompletion(report);
  fs.writeFileSync(path.join(output, 'm4-completion.json'), JSON.stringify(report) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    'M4 fixed runtime completed its ' +
      (report.privateCases.length + report.profileCases.length) +
      ' asserted cases and cleanup.'
  );
} catch {
  fs.writeFileSync(
    path.join(output, 'm4-failure.json'),
    JSON.stringify({
      failure: report?.failure ?? { stage: 'fixed-driver' },
      privateCases: report?.privateCases?.length ?? 0,
      profileCases: report?.profileCases?.length ?? 0,
      cleanupComplete: report?.cleanupComplete === true,
      remainingOwnedSessions: report?.remainingOwnedSessions ?? null,
      runtimeAdmission: false,
      nativeAdmission: false,
    }) + '\n',
    { mode: 0o600 }
  );
  console.error('M4 fixed runtime failed; no runtime evidence issued.');
  process.exitCode = 1;
}

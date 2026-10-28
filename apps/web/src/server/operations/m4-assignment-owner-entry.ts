// Fixed separately launched ESM service entry; production constructor only.
import { startM4PrivateAssignmentOwner } from './m4-assignment-owner';
import { readM4AssignmentOwnerConfiguration } from './m4-assignment-owner-config';
try {
  const owner = await startM4PrivateAssignmentOwner(readM4AssignmentOwnerConfiguration());
  let closing = false;
  const stop = () => {
    if (!closing) {
      closing = true;
      void owner.close().then(
        () => {
          process.exitCode = 0;
        },
        () => {
          process.exitCode = 1;
        }
      );
    }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  process.stdout.write('M4 assignment owner listening ' + owner.origin + '\n');
} catch {
  process.stderr.write('M4 assignment owner startup refused\n');
  process.exitCode = 1;
}

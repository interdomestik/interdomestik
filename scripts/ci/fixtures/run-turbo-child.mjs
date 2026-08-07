import process from 'node:process';

import { runTurbo } from '../run-turbo.mjs';

const [mode, value] = process.argv.slice(2);

if (mode === 'exit') {
  runTurbo(['-e', `process.exit(${Number.parseInt(value, 10)})`], {
    executable: process.execPath,
  });
} else if (mode === 'signal') {
  runTurbo(['-e', `process.kill(process.pid, ${JSON.stringify(value)})`], {
    executable: process.execPath,
  });
} else {
  throw new Error(`Unsupported fixture mode: ${mode}`);
}

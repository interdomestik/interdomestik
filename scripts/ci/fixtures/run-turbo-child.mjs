import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { runTurbo } from '../run-turbo.mjs';

const [mode, value] = process.argv.slice(2);
const target = fileURLToPath(new URL('./run-turbo-target.mjs', import.meta.url));

if (mode === 'exit' || mode === 'signal') {
  runTurbo([target, mode, value], { executable: process.execPath });
} else {
  throw new Error(`Unsupported fixture mode: ${mode}`);
}

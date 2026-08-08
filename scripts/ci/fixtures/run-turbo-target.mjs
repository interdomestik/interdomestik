import process from 'node:process';

const [mode, value] = process.argv.slice(2);

if (mode === 'exit') process.exit(Number.parseInt(value, 10));
if (mode === 'signal') process.kill(process.pid, value);

throw new Error(`Unsupported target mode: ${mode}`);

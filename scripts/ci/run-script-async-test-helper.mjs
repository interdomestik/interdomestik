import { spawn } from 'node:child_process';
import path from 'node:path';

export function runScriptAsync(scriptPath, root, args = [], options = {}) {
  const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);

  return new Promise(resolve => {
    const child = spawn(process.execPath, [absoluteScriptPath, ...args], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'test', ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('close', status => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

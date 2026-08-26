import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function parseGitNameStatus(output) {
  const fields = Buffer.from(output).toString('utf8').split('\0').filter(Boolean);
  if (fields.length % 2 !== 0) throw new Error('Repo size Git change inventory is malformed.');
  const changes = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const filePath = fields[index + 1];
    if (!/^[ADMTUXB]$/u.test(status) || !filePath) {
      throw new Error('Repo size Git change inventory includes an unsupported status.');
    }
    changes.push({ status, path: filePath });
  }
  return changes;
}

export function collectGitChangeFacts({ repoRoot, baseSha, trackedFiles, gitBin, env }) {
  const output = execFileSync(
    gitBin,
    ['diff', '--name-status', '-z', '--no-renames', baseSha, '--'],
    { cwd: repoRoot, encoding: 'buffer', env }
  );
  const currentPaths = new Set(trackedFiles);
  return parseGitNameStatus(output).map(({ status, path: relPath }) => {
    const baseBytes =
      status === 'A'
        ? 0
        : Number(
            execFileSync(gitBin, ['cat-file', '-s', `${baseSha}:${relPath}`], {
              cwd: repoRoot,
              encoding: 'utf8',
              env,
              stdio: ['ignore', 'pipe', 'ignore'],
            }).trim()
          );
    const absolutePath = path.join(repoRoot, relPath);
    const currentExists = currentPaths.has(relPath) && fs.existsSync(absolutePath);
    const currentBytes = currentExists ? fs.statSync(absolutePath).size : 0;
    return {
      path: relPath,
      bytesDelta: currentBytes - baseBytes,
      filesDelta: Number(currentExists) - Number(status !== 'A'),
    };
  });
}

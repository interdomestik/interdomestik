import { spawnSync } from 'node:child_process';

const GIT_BIN = '/usr/bin/git';

function runGit(args) {
  const result = spawnSync(GIT_BIN, args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
  });
  return {
    command: `git ${args.join(' ')}`,
    output: `${result.stdout || ''}${result.stderr || ''}`,
    exitCode: result.status ?? -1,
  };
}

export function buildGitStatusOutput() {
  const sections = [
    ['status', ['status', '--short', '--branch']],
    ['staged', ['diff', '--cached', '--name-status']],
    ['unstaged', ['diff', '--name-status']],
    ['untracked', ['ls-files', '--others', '--exclude-standard']],
  ];
  let exitCode = 0;
  const output = sections
    .map(([label, args]) => {
      const result = runGit(args);
      if (result.exitCode !== 0 && exitCode === 0) exitCode = result.exitCode;
      return [`## ${label}`, `$ ${result.command}`, result.output.trim() || '<empty>'].join('\n');
    })
    .join('\n\n');
  return { output: `${output}\n`, exitCode };
}

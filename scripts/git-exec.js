const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const FIXED_GIT_EXECUTABLE_PATHS = ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'];

function resolveGitExecutable() {
  const executable = FIXED_GIT_EXECUTABLE_PATHS.find(candidate => fs.existsSync(candidate));
  if (!executable) {
    throw new Error(`git executable was not found in ${FIXED_GIT_EXECUTABLE_PATHS.join(', ')}`);
  }
  return executable;
}

const GIT_EXECUTABLE = resolveGitExecutable();

function execGit(args, options = {}) {
  return execFileSync(GIT_EXECUTABLE, args, options);
}

module.exports = {
  execGit,
  GIT_EXECUTABLE,
};

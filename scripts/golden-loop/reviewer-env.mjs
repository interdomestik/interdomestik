export function reviewerEnv(baseEnv = process.env) {
  const home = baseEnv.HOME || '';
  const paths = [
    baseEnv.PATH || '',
    home && `${home}/.npm-global/bin`,
    home && `${home}/Library/pnpm/nodejs/24.15.0/bin`,
    home && `${home}/.local/bin`,
    home && `${home}/.bun/bin`,
    home && `${home}/.yarn/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ].filter(Boolean);
  return { ...baseEnv, PATH: [...new Set(paths)].join(':') };
}

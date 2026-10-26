import fs from 'node:fs';
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
// This module and adjacent data are part of the immutable reviewed producer.
// Candidate repoRoot, environment, options and report JSON never select this file.
export const M4_PROOF_POLICY = freeze(
  JSON.parse(fs.readFileSync(new URL('./db-access-m4-proof-policy.json', import.meta.url), 'utf8'))
);

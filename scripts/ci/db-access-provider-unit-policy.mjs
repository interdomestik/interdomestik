import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { loadCrmProofPolicy } from './db-access-crm-policy-loader.mjs';
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
// Fixed G2 data beside immutable executable source. Candidate paths never select this artifact.
const policy = JSON.parse(
  fs.readFileSync(new URL('./db-access-provider-unit-policy.json', import.meta.url), 'utf8')
);
const messageData = 'scripts/ci/db-access-message-proof-policy.json';
const expected = policy.producerFiles?.[messageData];
if (expected) {
  const location = new URL('./db-access-message-proof-policy.json', import.meta.url);
  const bytes = fs.readFileSync(location);
  const stat = fs.lstatSync(location);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o111 ? '100755' : '100644') !== expected.mode ||
    bytes.length !== expected.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== expected.sha256
  )
    throw new Error('incomplete: fixed message policy source mismatch');
  policy.messageProof = JSON.parse(bytes);
}
const crmProof = loadCrmProofPolicy(policy);
if (crmProof) policy.crmProof = crmProof;
export const PROVIDER_UNIT_POLICY = freeze(policy);

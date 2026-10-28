import fs from 'node:fs';
import path from 'node:path';
import { hash, refuse } from './db-access-provider-runtime-identity.mjs';

const SELF_POLICY = 'scripts/ci/db-access-provider-unit-policy.json';
const REQUIRED_FIXED = [
  'scripts/ci/db-access-provider-unit-policy.mjs',
  'scripts/ci/db-access-adoption.mjs',
];
const same = (left, right) => ['bytes', 'mode', 'sha256'].every(key => left[key] === right[key]);

// Only the policy JSON cannot contain its own digest. Executable producer pins
// always come from the immutable policy and are checked by the existing snapshot.
export function providerRuntimeProducerRecords(policy, producer) {
  const fixed = policy.producerFiles ?? {};
  const runtime = policy.runtimeFiles ?? {};
  for (const file of REQUIRED_FIXED) {
    const pin = fixed[file];
    if (
      !pin ||
      !['100644', '100755'].includes(pin.mode) ||
      !Number.isSafeInteger(pin.bytes) ||
      pin.bytes < 1 ||
      !/^[a-f0-9]{64}$/u.test(pin.sha256 ?? '')
    )
      refuse('missing or invalid fixed producer descriptor ' + file);
  }
  if (Object.hasOwn(fixed, SELF_POLICY) || Object.hasOwn(runtime, SELF_POLICY))
    refuse('self-referential policy JSON must use only its source-commit descriptor');
  for (const [file, pin] of Object.entries(runtime))
    if (Object.hasOwn(fixed, file) && !same(fixed[file], pin))
      refuse('conflicting fixed/runtime producer descriptor ' + file);

  const full = path.join(producer, SELF_POLICY);
  const stat = fs.lstatSync(full);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    fs.realpathSync(full) !== full ||
    stat.mode & 0o111
  )
    refuse('self-referential policy JSON must be a regular non-executable file');
  const bytes = fs.readFileSync(full);
  return {
    ...runtime,
    ...fixed,
    [SELF_POLICY]: { sha256: hash(bytes), bytes: bytes.length, mode: '100644' },
  };
}

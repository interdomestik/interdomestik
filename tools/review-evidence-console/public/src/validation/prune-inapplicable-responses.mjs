import { descriptorIsApplicable } from './descriptor-required.mjs';

export function pruneInapplicableResponses(descriptors, responses) {
  const next = { ...responses };
  let changed;
  do {
    changed = false;
    for (const descriptor of descriptors) {
      if (Object.hasOwn(next, descriptor.key) && !descriptorIsApplicable(descriptor, next)) {
        delete next[descriptor.key];
        changed = true;
      }
    }
  } while (changed);
  return next;
}

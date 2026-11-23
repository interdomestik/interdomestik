// The lockfile records of the Next wrappers the fixed configuration reviewed (the WP-05 flip, D-1),
// read with a YAML parser (r7): a comment, a quoting style or a key order cannot make a line reader
// see another record than pnpm does.
import yaml from 'js-yaml';

import { ScanError } from '../server-mutation/ast.mjs';

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// pnpm's dependency-path version: `<version>` followed by groups; the first group is the package's
// own patch when it starts with `patch_hash=` (later groups are peers, which may carry their own).
function splitVersion(text) {
  const match = /^([^()]+)((?:\(.*\))?)$/su.exec(text);
  if (!match) return null;
  const own = /^\(patch_hash=([^)]*)\)/u.exec(match[2]);
  return { version: match[1], patch: own ? own[1] : null };
}

export function parseLockfile(text, label = 'pnpm-lock.yaml') {
  let data;
  try {
    data = yaml.load(text);
  } catch {
    throw new ScanError(`${label} is not parseable`);
  }
  if (!isObject(data)) throw new ScanError(`${label} is not parseable`);
  return data;
}

// name -> { version, patch, integrity, patched } for each named package as `apps/web` resolves it,
// where `patched` lists the package's `patchedDependencies` entries (`key hash path`, sorted); a
// package listed in no or more than one dependency section is `null`.
export function wrapperRecords(data, names) {
  const web = isObject(data.importers) ? data.importers['apps/web'] : null;
  const packages = isObject(data.packages) ? data.packages : {};
  const patchedDependencies = isObject(data.patchedDependencies) ? data.patchedDependencies : {};
  const out = {};
  for (const name of names) {
    const entries = SECTIONS.map(section =>
      isObject(web?.[section]) ? web[section][name] : undefined
    ).filter(entry => entry !== undefined);
    const raw = entries.length === 1 && isObject(entries[0]) ? entries[0].version : null;
    const split = typeof raw === 'string' ? splitVersion(raw) : null;
    if (!split) {
      out[name] = null;
      continue;
    }
    const record = packages[`${name}@${split.version}`];
    const integrity = isObject(record?.resolution) ? (record.resolution.integrity ?? null) : null;
    out[name] = {
      version: split.version,
      patch: split.patch,
      integrity: typeof integrity === 'string' ? integrity : null,
      patched: Object.entries(patchedDependencies)
        .filter(([key]) => key === name || key.startsWith(`${name}@`))
        .map(([key, entry]) =>
          isObject(entry) ? `${key} ${entry.hash ?? ''} ${entry.path ?? ''}` : `${key} ${entry}`
        )
        .sort(),
    };
  }
  return out;
}

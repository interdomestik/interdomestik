import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { isAbsolute, normalize, posix, relative, resolve, sep } from 'node:path';

const READ_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;

export function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function must(condition, message) {
  if (!condition) throw new Error(message);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareText)
        .map(key => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function exactKeys(value, expected, label) {
  must(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  must(
    JSON.stringify(Object.keys(value).sort(compareText)) ===
      JSON.stringify([...expected].sort(compareText)),
    `${label} keys are invalid`
  );
}

export function sortedText(values) {
  return [...values].sort(compareText);
}

export function nonEmptyString(value, label) {
  must(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

export function positiveInteger(value, label) {
  must(Number.isSafeInteger(value) && value > 0, `${label} must be a positive integer`);
  return value;
}

export function safeRelativePath(value, label) {
  nonEmptyString(value, label);
  must(!isAbsolute(value), `${label} is unsafe`);
  must(value === posix.normalize(value) && normalize(value) === value, `${label} is unsafe`);
  must(value !== '..' && !value.startsWith('../') && !value.includes('/../'), `${label} is unsafe`);
  must(!value.startsWith('./') && !value.includes('\\'), `${label} is unsafe`);
  return value;
}

export function sortedUnique(values, label, validate = nonEmptyString) {
  must(Array.isArray(values), `${label} must be an array`);
  const normalized = values.map(value => validate(value, label));
  must(new Set(normalized).size === normalized.length, `${label} must be unique`);
  return normalized.sort(compareText);
}

export function readBoundedRegularText(filePath, { label, maxBytes, allowedRoots }) {
  must(
    Array.isArray(allowedRoots) && allowedRoots.length > 0,
    `${label} trusted roots are required`
  );
  const inputRoots = allowedRoots.map(root => resolve(root)).filter(root => root !== '/');
  must(inputRoots.length === allowedRoots.length, `${label} trusted root is unsafe`);
  const candidate = resolve(filePath);
  const inputRoot = inputRoots.find(
    root => candidate === root || candidate.startsWith(`${root}${sep}`)
  );
  must(inputRoot, `${label} must be contained by a trusted root`);
  const relativePath = safeRelativePath(relative(inputRoot, candidate), `${label} path`);
  const trustedRoot = fs.realpathSync(inputRoot);
  must(trustedRoot !== '/', `${label} trusted root is unsafe`);
  let rootedCandidate = trustedRoot;
  for (const segment of relativePath.split('/')) {
    const entry = fs
      .readdirSync(rootedCandidate, { withFileTypes: true })
      .find(item => item.name === segment);
    must(entry && !entry.isSymbolicLink(), `${label} path is unavailable, unsafe, or symlinked`);
    rootedCandidate = resolve(rootedCandidate, entry.name);
  }
  let descriptor;
  try {
    descriptor = fs.openSync(rootedCandidate, READ_FLAGS);
    const opened = fs.fstatSync(descriptor, { bigint: true });
    must(opened.isFile(), `${label} must remain a regular file.`);
    must(opened.size <= BigInt(maxBytes), `${label} exceeds the input size limit.`);
    const resolvedCandidate = fs.realpathSync(rootedCandidate);
    must(
      resolvedCandidate.startsWith(`${trustedRoot}${sep}`),
      `${label} must remain contained by a trusted root`
    );
    const named = fs.lstatSync(resolvedCandidate, { bigint: true });
    must(named.dev === opened.dev && named.ino === opened.ino, `${label} path changed`);
    return fs.readFileSync(descriptor, 'utf8');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function deriveEvidenceIdentityKey(identity) {
  return sha256(
    canonicalJson({
      lane: identity.lane,
      headSha: identity.headSha,
      treeSha: identity.treeSha,
      commandDigest: identity.commandDigest,
      workflowDigest: identity.workflowDigest,
      substrateDigest: identity.substrateDigest,
      writerMapDigest: identity.writerMapDigest,
    })
  );
}

export function normalizeGitHubOrigin(origin) {
  must(typeof origin === 'string' && origin, 'repository origin is invalid');
  const match = origin.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/u
  );
  must(match, 'repository origin is not a supported GitHub identity');
  const providerRepository = `${match[1]}/${match[2]}`.toLowerCase();
  return {
    origin: `https://github.com/${providerRepository}.git`,
    providerRepository,
  };
}

export function isSafeGitBranch(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]+$/u.test(value)) return false;
  const forbidden = ['..', '~', '^', ':', '?', '*', '[', '\\', '/.', '@{', '//'];
  return (
    value !== 'HEAD' &&
    !value.startsWith('-') &&
    !value.startsWith('/') &&
    !value.endsWith('/') &&
    !value.endsWith('.') &&
    !value.endsWith('.lock') &&
    !value.includes('/.lock/') &&
    !/\s/u.test(value) &&
    forbidden.every(token => !value.includes(token))
  );
}

export function normalizeGitBranch(value) {
  must(isSafeGitBranch(value), 'operation branch is invalid');
  return value;
}

export function normalizeOperationOrigin(value) {
  must(
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/u.test(value),
    'operation origin is invalid'
  );
  return value.replace(/\.git$/u, '');
}

export function normalizeArtifactPath(value) {
  must(
    typeof value === 'string' && value.length > 1 && !value.includes('\0'),
    'cleanup artifact path is invalid'
  );
  must(
    value !== '/' && value !== '.' && value === posix.normalize(value),
    'cleanup artifact path is unsafe'
  );
  if (!isAbsolute(value)) {
    must(
      value !== '..' && !value.startsWith('../') && !value.includes('/../'),
      'cleanup artifact path is unsafe'
    );
  }
  return value;
}

export function normalizeCommitSha(value, label) {
  must(typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value), `${label} is invalid`);
  return value;
}

export function normalizePullRequestNumber(value) {
  must(Number.isSafeInteger(value) && value > 0, 'operation PR number is invalid');
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

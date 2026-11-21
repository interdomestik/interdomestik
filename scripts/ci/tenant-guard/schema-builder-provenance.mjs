// Bind Drizzle builders to the reviewed artifact and their external resolver origins.

import path from 'node:path/posix';
import { hasParallelTarget } from './modules.mjs';
import { isResolverConfig, pathRuleMatch } from './resolution.mjs';
import { SCHEMA_DIR } from './schema-builder-imports.mjs';
import { APP_ALIASES } from './sources.mjs';

const BARREL = `${SCHEMA_DIR}index.ts`;
// The reviewed 0.45.2 artifact has these sole import/default and require targets. The
// parser is deliberately limited to the pinned lockfile layout and the database importer.
const REVIEWED_BUILDERS = ['drizzle-orm', 'drizzle-orm/pg-core'];
const ARTIFACTS = [
  [
    'drizzle-orm',
    '0.45.2',
    'kY0BSaTNYWnoDMVoyY8uxmyHjpJW1geOmBMdSSicKo9CIIWkSxMIj2rkeSR51b8KAPB7m+qysjuHme5nKP+E5Q==',
  ],
  [
    'drizzle-kit',
    '0.31.10',
    '7OZcmQUrdGI+DUNNsKBn1aW8qSoKuTH7d0mYgSP8bAzdFzKoovxEFnoGQp2dVs82EOJeYycqRtciopszwUf8bw==',
  ],
];

export function provenanceProblem(anchor, before, after) {
  for (const specifier of REVIEWED_BUILDERS) {
    for (const tree of [before, after]) {
      if (
        tree.resolution.pathRules.some(
          ({ pattern }) => pathRuleMatch(pattern, specifier) !== null
        ) ||
        APP_ALIASES.some(([prefix]) => specifier.startsWith(prefix))
      )
        return `builder alias matches ${specifier}`;
      if (
        tree.inventory.resolveSpecifier(BARREL, specifier).external !== specifier ||
        tree.resolution.baseRoots.some(root => {
          const stem = path.join(root, specifier);
          return tree.files.has(`${stem}.ts`) || hasParallelTarget(tree.files, stem);
        })
      )
        return `workspace builder candidate ${specifier}`;
    }
  }
  return builderArtifactProblem(anchor, before, after);
}

const LOCK = 'pnpm-lock.yaml';
const DB_MANIFEST = 'packages/database/package.json';
const LOADER_FIELDS = [
  'pnpm',
  'overrides',
  'resolutions',
  'packageManager',
  'browser',
  '_moduleAliases',
];
const DB_RESOLUTION_FIELDS = ['name', 'exports', 'main', 'module', 'types', 'imports', 'type'];
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const DRIZZLE_PACKAGE = /^drizzle-(?:orm|kit)$/u;
const DRIZZLE_ENTRY = /^ {6}['"]?drizzle-(?:orm|kit)['"]?:/u;
const DRIZZLE_ARTIFACT = /^ {2}['"]?drizzle-(?:orm|kit)@/u;

function manifestLoaderFields(file, text) {
  if (text === undefined) return undefined;
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return text;
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return text;
  const keys = LOADER_FIELDS.filter(key => Object.hasOwn(manifest, key));
  if (file === DB_MANIFEST) {
    keys.push(...DB_RESOLUTION_FIELDS.filter(key => Object.hasOwn(manifest, key)));
  } else if (DRIZZLE_PACKAGE.test(manifest.name)) {
    keys.push('name', 'exports', 'main');
  }
  const inputs = keys.map(key => [key, manifest[key]]);
  for (const section of DEPENDENCY_FIELDS) {
    for (const [name, specifier] of Object.entries(manifest[section] ?? {})) {
      if (DRIZZLE_PACKAGE.test(name)) inputs.push([section, name, specifier]);
    }
  }
  return inputs.length ? JSON.stringify(inputs) : undefined;
}

function builderInput(tree, file) {
  if (isResolverConfig(file)) return tree.resolution.configInputs.get(file);
  const text = tree.inputs.get(file);
  if (file.endsWith('/package.json') || file === 'package.json')
    return manifestLoaderFields(file, text);
  return text;
}

function changedInput(anchor, after) {
  for (const file of new Set([...anchor.inputs.keys(), ...after.inputs.keys()])) {
    if (file === LOCK || anchor.inputs.get(file) === after.inputs.get(file)) continue;
    if (builderInput(anchor, file) !== builderInput(after, file))
      return `resolver input changed ${file}`;
  }
  return null;
}

function drizzleImporterEntries(importer) {
  const [name, ...groups] = importer.split(/(?=^ {4}\S)/mu);
  return groups.flatMap(group => {
    const [header, ...entries] = group.split(/(?=^ {6}\S)/mu);
    return entries
      .filter(entry => DRIZZLE_ENTRY.test(entry))
      .map(entry => [name, header, entry.trimEnd()]);
  });
}

function reviewedLockBlocks(text) {
  const settings = [];
  const imports = [];
  const artifacts = [];
  for (const section of text.split(/(?=^\S)/mu)) {
    const [header, ...entries] = section.split(/(?=^ {2}\S)/mu);
    if (header.startsWith('importers:')) imports.push(...entries.flatMap(drizzleImporterEntries));
    else if (/^(?:packages|snapshots):/u.test(header))
      artifacts.push(
        ...entries.filter(block => DRIZZLE_ARTIFACT.test(block)).map(block => block.trimEnd())
      );
    else settings.push(section.trimEnd());
  }
  return { settings, imports, artifacts };
}

function hasReviewedArtifact(blocks, manifest, name, version, integrity) {
  const signature = `integrity: sha512-${integrity},`;
  const matches = blocks.artifacts.filter(
    block => block?.startsWith(`  ${name}@${version}:`) && block.includes(signature)
  );
  const range = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
  const importer = `      ${name}:\n        specifier: ^${version}\n        version: ${version}`;
  return (
    matches.length === 1 &&
    range === `^${version}` &&
    blocks.imports.some(
      ([owner, , entry]) => owner === '  packages/database:\n' && entry.startsWith(importer)
    )
  );
}

function builderArtifactProblem(anchor, before, after) {
  const change = changedInput(anchor, before) ?? changedInput(anchor, after);
  if (change) return change;
  const current = reviewedLockBlocks(after.inputs.get(LOCK) ?? '');
  const previous = JSON.stringify(reviewedLockBlocks(anchor.inputs.get(LOCK) ?? ''));
  const prior = reviewedLockBlocks(before.inputs.get(LOCK) ?? '');
  if (JSON.stringify(current) !== previous || JSON.stringify(prior) !== previous)
    return 'unreviewed Drizzle lock resolution';
  const manifest = JSON.parse(after.inputs.get(DB_MANIFEST) ?? '{}');
  for (const [name, version, integrity] of ARTIFACTS) {
    if (!hasReviewedArtifact(current, manifest, name, version, integrity))
      return `unproven artifact ${name}`;
  }
  return null;
}

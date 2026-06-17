import { collectTenantContextAliasNames } from './db-access-posture.mjs';

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function createAliasState() {
  return {
    aliases: new Set(['db']),
    directDbAliases: new Set(['db']),
    adminAliases: new Set(['dbAdmin']),
    rlsAliases: new Set(['dbRls']),
    claimTableAliases: new Set(['claims', 'claimsTable']),
  };
}

function collectImportedDbAliases(searchableSource) {
  const state = createAliasState();
  const importPattern = /\bimport\s*\{([^}]*)\}/gu;

  for (const match of searchableSource.matchAll(importPattern)) {
    for (const specifier of match[1].split(',')) {
      const importedAlias = parseImportedDbAlias(specifier);
      if (importedAlias) addImportedAlias(state, importedAlias);
    }
  }

  return state;
}

function parseImportedDbAlias(specifier) {
  const dbImportMatch = specifier
    .trim()
    .match(/^(db|dbRls|dbAdmin|claims|claimsTable)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/u);
  if (!dbImportMatch) return null;

  const importedName = dbImportMatch[1];
  return { importedName, localName: dbImportMatch[2] ?? importedName };
}

function addImportedAlias(state, { importedName, localName }) {
  if (importedName === 'claims' || importedName === 'claimsTable') {
    state.claimTableAliases.add(localName);
    return;
  }

  state.aliases.add(localName);
  if (importedName === 'db') state.directDbAliases.add(localName);
  if (importedName === 'dbAdmin') state.adminAliases.add(localName);
  if (importedName === 'dbRls') state.rlsAliases.add(localName);
}

function collectAssignedAliases(searchableSource, aliases, onAlias) {
  let changed = true;

  while (changed) {
    changed = false;
    const aliasPattern = [...aliases].map(escapeRegExp).join('|');
    const assignmentPattern = new RegExp(
      String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:${aliasPattern})\b`,
      'gu'
    );

    for (const match of searchableSource.matchAll(assignmentPattern)) {
      if (aliases.has(match[1])) continue;
      aliases.add(match[1]);
      onAlias(match[1], match[0].match(/=\s*([A-Za-z_$][\w$]*)\b/u)?.[1] ?? '');
      changed = true;
    }
  }
}

function collectDbAssignments(searchableSource, state) {
  collectAssignedAliases(searchableSource, state.aliases, (assignedName, initializer) => {
    if (state.directDbAliases.has(initializer)) state.directDbAliases.add(assignedName);
    if (state.adminAliases.has(initializer)) state.adminAliases.add(assignedName);
    if (state.rlsAliases.has(initializer)) state.rlsAliases.add(assignedName);
  });
}

function collectTenantContextAliases(source, relativePath, state) {
  for (const alias of collectTenantContextAliasNames(source, relativePath)) {
    state.aliases.add(alias);
  }
}

function collectTransactionAliases(searchableSource, state) {
  const aliasPattern = [...state.aliases].map(escapeRegExp).join('|');
  const transactionAliasPattern = new RegExp(
    String.raw`\b(${aliasPattern})\s*\.\s*transaction\s*\(\s*(?:async\s*)?\(?\s*([A-Za-z_$][\w$]*)`,
    'gu'
  );

  for (const match of searchableSource.matchAll(transactionAliasPattern)) {
    state.aliases.add(match[2]);
    if (state.directDbAliases.has(match[1])) state.directDbAliases.add(match[2]);
    if (state.adminAliases.has(match[1])) state.adminAliases.add(match[2]);
    if (state.rlsAliases.has(match[1])) state.rlsAliases.add(match[2]);
  }
}

export function collectDbAliases(searchableSource, source, relativePath) {
  const state = collectImportedDbAliases(searchableSource);
  collectDbAssignments(searchableSource, state);
  collectAssignedAliases(searchableSource, state.claimTableAliases, () => {});
  collectTenantContextAliases(source, relativePath, state);
  collectTransactionAliases(searchableSource, state);
  return state;
}

export function callFirstArgumentName(searchableSource, matchEndIndex) {
  const callSuffix = searchableSource.slice(matchEndIndex);
  const target = callSuffix.match(/^\s*\(\s*((?:[A-Za-z_$][\w$]*\s*\.\s*)*[A-Za-z_$][\w$]*)/u)?.[1];
  return target?.split('.').at(-1)?.trim() ?? '';
}

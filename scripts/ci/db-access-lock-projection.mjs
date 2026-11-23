import { createHash } from 'node:crypto';
import path from 'node:path';

// Protected G0 source: the canonical projection of pnpm-lock.yaml that the resolver snapshot pins.
// It drops exactly the well-formed first-party workspace links under `importers:` and keeps every
// other byte. Node builtins only: the approved source runs without installed packages.
export const LOCK_PROJECTION_ID = 'interdomestik-g0-lock-projection-v1';

const TOP_KEY = /^([A-Za-z][A-Za-z0-9]*):(?: .*)?$/u;
const IMPORTER = /^ {2}(\.|[a-z0-9-]+(?:\/[a-z0-9-]+)*):$/u;
const BLOCK = /^ {4}(dependencies|devDependencies|optionalDependencies):$/u;
const ENTRY = /^ {6}('[^'\n]+'|[A-Za-z0-9@][^:\s]*):$/u;
const SPECIFIER = /^ {8}specifier: (\S.*)$/u;
const VERSION = /^ {8}version: (\S.*)$/u;
const FIRST_PARTY = /^@interdomestik\/([a-z0-9-]+)$/u;
const SCOPE = '@interdomestik/';

const refuse = reason => {
  throw new Error(`incomplete: lockfile projection ${reason}`);
};

function decodeText(bytes) {
  if (!Buffer.isBuffer(bytes)) refuse('input is not bytes');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return refuse('invalid UTF-8');
  }
}

function decode(bytes) {
  const text = decodeText(bytes);
  if (text.length === 0) refuse('empty');
  if (text.codePointAt(0) === 0xfeff) refuse('byte order mark');
  if (/[\r\t\0]/u.test(text)) refuse('carriage return, tab or NUL');
  if (!text.endsWith('\n') || text.endsWith('\n\n')) refuse('final newline');
  return text.slice(0, -1).split('\n');
}

// A top-level key name, or null for a continuation or blank line.
function topKey(line, index) {
  if (line === '' || line.startsWith(' ')) {
    if (index === 0) refuse('leading continuation');
    return null;
  }
  const match = TOP_KEY.exec(line);
  if (!match) refuse(`unsupported top-level line ${index + 1}`);
  return match[1];
}

// Locate the `importers:` section: [first line after the header, first line of the next key).
function importerRange(lines) {
  const seen = new Set();
  let start = -1;
  let end = lines.length;
  for (const [index, line] of lines.entries()) {
    const name = topKey(line, index);
    if (name === null) continue;
    if (seen.has(name)) refuse(`duplicate top-level key ${name}`);
    seen.add(name);
    if (start >= 0 && end === lines.length) end = index;
    if (name !== 'importers') continue;
    if (line !== 'importers:') refuse('importers has an inline value');
    start = index + 1;
  }
  if (start < 0) refuse('no importers');
  return [start, end];
}

const LINE_FORMS = [
  ['importer', IMPORTER],
  ['block', BLOCK],
  ['entry', ENTRY],
  ['specifier', SPECIFIER],
  ['version', VERSION],
];

function classify(line) {
  if (line === '') return { kind: 'blank' };
  for (const [kind, form] of LINE_FORMS) {
    const match = form.exec(line);
    if (match) return { kind, value: match[1] };
  }
  return { kind: 'unsupported' };
}

function closeEntry(state, index) {
  if (state.entry !== null && state.entry.version === undefined)
    refuse(`incomplete entry before line ${index + 1}`);
  state.entry = null;
}

function closeBlock(state, index) {
  closeEntry(state, index);
  if (state.block?.entries.size === 0) refuse(`empty block before line ${index + 1}`);
  state.block = null;
}

// One handler per line kind; each enforces where that kind may appear.
const HANDLERS = {
  blank(state, _value, _line, index) {
    closeEntry(state, index);
    state.items.push({ kind: 'blank' });
  },
  importer(state, value, line, index) {
    closeBlock(state, index);
    if (state.importers.has(value)) refuse(`duplicate importer ${value}`);
    state.importer = { name: value, blocks: new Map() };
    state.importers.set(value, state.importer);
    state.items.push({ kind: 'importer', line });
  },
  block(state, value, line, index) {
    const { importer } = state;
    if (!importer) refuse(`block outside an importer at line ${index + 1}`);
    closeBlock(state, index);
    if (importer.blocks.has(value)) refuse(`duplicate block ${importer.name} ${value}`);
    state.block = { name: value, entries: new Map(), line };
    importer.blocks.set(value, state.block);
    state.items.push({ kind: 'block', importer, block: state.block });
  },
  entry(state, value, line, index) {
    const { importer, block } = state;
    if (!block) refuse(`entry outside a block at line ${index + 1}`);
    closeEntry(state, index);
    const name = value.startsWith("'") ? value.slice(1, -1) : value;
    if (block.entries.has(name)) refuse(`duplicate entry ${importer.name} ${name}`);
    state.entry = { name, quoted: value.startsWith("'"), line };
    block.entries.set(name, state.entry);
    state.items.push({ kind: 'entry', importer, block, entry: state.entry });
  },
  specifier(state, value, line, index) {
    const { entry } = state;
    if (!entry || entry.specifier !== undefined)
      refuse(`unexpected specifier at line ${index + 1}`);
    entry.specifier = value;
    entry.specifierLine = line;
  },
  version(state, value, line, index) {
    const { entry } = state;
    if (entry?.specifier === undefined || entry.version !== undefined)
      refuse(`unexpected version at line ${index + 1}`);
    entry.version = value;
    entry.versionLine = line;
  },
  unsupported(_state, _value, _line, index) {
    refuse(`unsupported importers line ${index + 1}`);
  },
};

// Parse the section into ordered records; every line must fit the closed grammar.
function parseImporters(lines, start, end) {
  const state = { items: [], importers: new Map(), importer: null, block: null, entry: null };
  for (let index = start; index < end; index += 1) {
    const { kind, value } = classify(lines[index]);
    HANDLERS[kind](state, value, lines[index], index);
  }
  closeBlock(state, end);
  if (state.importers.size === 0) refuse('no importer records');
  return { items: state.items, importers: state.importers };
}

// A first-party entry is removable only in its one canonical form; any other form refuses.
function firstParty(importer, entry, importers) {
  if (!entry.name.startsWith(SCOPE)) return false;
  if (!entry.quoted) refuse(`unquoted first-party key ${entry.name}`);
  const match = FIRST_PARTY.exec(entry.name);
  if (!match) refuse(`malformed first-party name ${entry.name}`);
  const target = `packages/${match[1]}`;
  if (!importers.has(target)) refuse(`first-party target is not an importer ${target}`);
  const from = importer.name === '.' ? '/repo' : `/repo/${importer.name}`;
  const to = `/repo/${target}`;
  const expected = `link:${path.posix.relative(from, to)}`;
  if (entry.specifier !== 'workspace:*' || entry.version !== expected)
    refuse(`non-canonical first-party entry ${importer.name} ${entry.name}`);
  return true;
}

// Parse, then check every first-party entry: the entries the projection keeps, or a refusal.
function parse(bytes) {
  const lines = decode(bytes);
  const [start, end] = importerRange(lines);
  const parsed = { lines, start, end, ...parseImporters(lines, start, end) };
  const kept = new Set();
  for (const item of parsed.items)
    if (item.kind === 'entry' && !firstParty(item.importer, item.entry, parsed.importers))
      kept.add(item.entry);
  return { ...parsed, kept };
}

/** The parsed importers, every first-party entry canonical: name → block → entry → { specifier, version }. */
export function lockImporters(bytes) {
  const { importers } = parse(bytes);
  return new Map(
    [...importers].map(([name, importer]) => [
      name,
      new Map(
        [...importer.blocks].map(([blockName, block]) => [
          blockName,
          new Map(
            [...block.entries].map(([entryName, entry]) => [
              entryName,
              { specifier: entry.specifier, version: entry.version },
            ])
          ),
        ])
      ),
    ])
  );
}

/** SHA-256 of the canonical projection; throws `incomplete: lockfile projection …` on any doubt. */
export function lockProjection(bytes) {
  const { lines, start, end, items, kept } = parse(bytes);
  const out = lines.slice(0, start);
  for (const item of items) {
    if (item.kind === 'blank') out.push('');
    else if (item.kind === 'importer') out.push(item.line);
    else if (item.kind === 'block') {
      if ([...item.block.entries.values()].some(entry => kept.has(entry)))
        out.push(item.block.line);
    } else if (kept.has(item.entry))
      out.push(item.entry.line, item.entry.specifierLine, item.entry.versionLine);
  }
  out.push(...lines.slice(end));
  const serialization = `${out.join('\n')}\n`;
  return {
    id: LOCK_PROJECTION_ID,
    sha256: createHash('sha256')
      .update(`${LOCK_PROJECTION_ID}\n`)
      .update(serialization)
      .digest('hex'),
  };
}

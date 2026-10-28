// DATA ONLY. The authenticated native owner supplies its existing model/inventory.
// Production integration imports one frozen producer catalog, never caller JSON.
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Error('M4 lineage observation refused: ' + reason);
};
const locator = (model, node) => [model.fileOf(node), node.pos, node.end, node.kind];
const key = value => JSON.stringify(value);

export function resolveLineageData(model, inventory, catalog) {
  if (
    catalog.version !== 1 ||
    catalog.historicalIdentitySelection !== false ||
    catalog.runtimeAdmission !== false
  )
    fail('catalog class');
  for (const [file, sha256] of Object.entries(catalog.frontier)) {
    const text = model.sources.get(file);
    if (typeof text !== 'string' || hash(text) !== sha256) fail('frontier source ' + file);
  }
  const byFile = new Map(),
    owners = new Map(),
    sites = [],
    identifiers = new Set();
  function nodeAt(file, expected) {
    if (!byFile.has(file)) {
      const sf = model.parsed.get(file),
        nodes = new Map();
      if (!sf || sf.text !== model.sources.get(file)) fail('parsed source ' + file);
      model.walk(sf, node => {
        const value = [node.getStart(sf), node.end, node.kind];
        const id = key(value);
        if (nodes.has(id)) fail('ambiguous AST locator');
        nodes.set(id, node);
      });
      byFile.set(file, nodes);
    }
    const node = byFile
      .get(file)
      .get(key([expected.startUtf16, expected.endUtf16, expected.kindCode]));
    if (!node || hash(node.getText(model.parsed.get(file))) !== expected.nodeSha256)
      fail('missing or changed exact AST node');
    return node;
  }
  for (const site of catalog.sites) {
    if (identifiers.has(site.id) || catalog.frontier[site.file] !== site.sourceSha256)
      fail('duplicate site or unbound source');
    identifiers.add(site.id);
    const anchors = site.calls.map(call => locator(model, nodeAt(site.file, call)));
    const ownerLocators = [];
    for (const expected of site.owners) {
      const owner = nodeAt(site.file, expected),
        value = locator(model, owner);
      const membership = { siteId: site.id, family: site.family, side: site.side };
      const previous = owners.get(owner) ?? { owner: value, memberships: [], entries: [] };
      previous.memberships.push(membership);
      owners.set(owner, previous);
      ownerLocators.push(value);
    }
    sites.push({
      id: site.id,
      file: site.file,
      sourceSha256: site.sourceSha256,
      anchors,
      owners: ownerLocators,
      historicalIdentitiesReferenceOnly: [...site.historicalIdentitiesReferenceOnly],
      equivalenceAccepted: false,
      oldMountRetired: false,
    });
  }
  const entries = [];
  const nativeEntries = new WeakMap();
  for (const [inventoryIndex, entry] of inventory.entries.entries()) {
    const selected = owners.get(entry._owner);
    if (!selected) continue;
    const row = {
      inventoryIndex,
      identity: entry.identity,
      file: entry.file,
      method: entry.method,
      incomplete: Boolean(entry._incomplete),
      reason: entry.reason ?? null,
      owner: selected.owner,
      operation: locator(model, entry._node),
      memberships: selected.memberships.map(value => ({ ...value })),
    };
    nativeEntries.set(entry, row);
    selected.entries.push(row);
    entries.push(row);
  }
  // Internal maps never leave the authenticated census. Public output is data only.
  return {
    owners,
    nativeEntries,
    description: {
      version: 1,
      catalogDataSha256: hash(key(catalog)),
      sites,
      entries,
      ownerEnvelopeSelection: true,
      unresolvedFrontierFiles: Object.keys(catalog.frontier).filter(
        file => !sites.some(site => site.file === file)
      ),
      acceptedCoverage: 0,
      runtimeAdmission: false,
      allExecutableContextsQualified: false,
    },
  };
}

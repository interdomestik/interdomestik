// Lossless public fields plus exact AST owner/operation locators; authority stays with the producer.
export function encodeInventory(prepared) {
  return {
    changed: [...prepared.inventory.changed],
    entries: prepared.inventory.entries.map(row => {
      const owner = row._owner,
        operation = row._node;
      if (!owner) throw Error('incomplete: graph worker missing owner');
      if (!operation) throw Error('incomplete: graph worker missing operation');
      const sf = prepared.model.parsed.get(row.file);
      let ancestor = operation;
      while (ancestor && ancestor !== owner) ancestor = ancestor.parent;
      if (
        !sf ||
        operation.getSourceFile() !== sf ||
        !ancestor ||
        sf.text !== prepared.model.sources.get(row.file) ||
        operation.getText(sf) !== row.source ||
        operation.getText(sf) !== row.callee ||
        sf.getLineAndCharacterOfPosition(operation.getStart(sf)).line + 1 !== row.line
      )
        throw Error('incomplete: graph worker foreign operation/source/owner');
      return {
        row: Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_'))),
        indirect: row._indirect,
        incomplete: row._incomplete,
        owner: [prepared.model.fileOf(owner), owner.pos, owner.end, owner.kind],
        operation: [prepared.model.fileOf(operation), operation.pos, operation.end, operation.kind],
      };
    }),
  };
}

// Lossless public fields plus exact AST owner locators; authority stays with the producer.
export function encodeInventory(prepared) {
  return {
    changed: [...prepared.inventory.changed],
    entries: prepared.inventory.entries.map(row => {
      const owner = row._owner;
      if (!owner) throw Error('incomplete: graph worker missing owner');
      return {
        row: Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_'))),
        indirect: row._indirect,
        incomplete: row._incomplete,
        owner: [prepared.model.fileOf(owner), owner.pos, owner.end, owner.kind],
      };
    }),
  };
}

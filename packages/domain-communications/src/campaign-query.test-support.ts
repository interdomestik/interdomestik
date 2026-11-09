type ReadRows = (options: { where: unknown }) => Promise<unknown[]>;

function unionRows(sent: ReadRows, skipped: ReadRows, where: unknown) {
  return (other: { where: unknown }) =>
    Promise.all([sent({ where }), skipped({ where: other.where })]).then(rows => rows.flat());
}

function selectFrom(sent: ReadRows, skipped: ReadRows) {
  return () => ({
    where: (where: unknown) => ({ where, union: unionRows(sent, skipped, where) }),
  });
}

/** Models a single UNION execution; neither branch executes before union is called. */
export function campaignSelectMock(sent: ReadRows, skipped: ReadRows = () => Promise.resolve([])) {
  return () => ({ from: selectFrom(sent, skipped) });
}

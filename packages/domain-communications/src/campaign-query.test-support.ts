type ReadRows = (options: { where: unknown }) => Promise<unknown[]>;

/** Models a single UNION execution; neither branch executes before union is called. */
export function campaignSelectMock(sent: ReadRows, skipped: ReadRows = () => Promise.resolve([])) {
  return () => ({
    from: () => ({
      where: (where: unknown) => ({
        where,
        union: (other: { where: unknown }) =>
          Promise.all([sent({ where }), skipped({ where: other.where })]).then(rows => rows.flat()),
      }),
    }),
  });
}

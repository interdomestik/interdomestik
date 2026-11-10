'use client';

import type { OpsTableColumn, OpsTableRow } from './OpsTable';
import { OPS_TEST_IDS } from './testids';

/** One active representation; desktop keeps the comparison table. */
export function OpsTableCards({
  columns,
  rows,
  rowTestId,
}: Readonly<{
  columns: readonly OpsTableColumn[];
  rows: readonly OpsTableRow[];
  rowTestId?: string;
}>) {
  return (
    <div className="grid min-w-0 gap-3">
      {rows.map(row => {
        const content = columns.map((column, index) => (
          <span key={column.key} className="block min-w-0">
            <span className="block text-xs text-muted-foreground">{column.header}</span>
            <span className="block min-w-0 [&_.truncate]:whitespace-normal [&_.truncate]:overflow-visible [&_.w-48]:w-auto">
              {row.cells[index]}
            </span>
          </span>
        ));
        const testId = row.testId ?? rowTestId ?? OPS_TEST_IDS.TABLE.ROW;
        return (
          <div key={row.id} className="min-w-0 rounded-lg border bg-card">
            {row.onClick ? (
              <button
                type="button"
                data-testid={testId}
                className="grid min-h-11 w-full min-w-0 scroll-mt-40 gap-3 rounded-lg p-4 text-left [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={event => {
                  // Pointer activation does not focus buttons in every browser.
                  event.currentTarget.focus();
                  row.onClick?.();
                }}
              >
                {content}
              </button>
            ) : (
              <div data-testid={testId} className="grid min-w-0 gap-3 p-4 [overflow-wrap:anywhere]">
                {content}
              </div>
            )}
            {row.actions && <div className="flex flex-wrap gap-2 p-4 pt-0">{row.actions}</div>}
          </div>
        );
      })}
    </div>
  );
}

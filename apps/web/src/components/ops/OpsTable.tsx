'use client';

import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@interdomestik/ui';

type OpsTableColumn = {
  key: string;
  header: ReactNode;
  className?: string;
};

type OpsTableRow = {
  id: string;
  cells: ReactNode[];
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
  testId?: string;
};

interface OpsTableProps {
  columns: OpsTableColumn[];
  rows: OpsTableRow[];
  emptyLabel: string;
  loading?: boolean;
  actionsHeader?: ReactNode;
  rowTestId?: string;
  containerClassName?: string;
}

export function OpsTable({
  columns,
  rows,
  emptyLabel,
  loading,
  actionsHeader,
  rowTestId,
  containerClassName,
}: OpsTableProps) {
  const colCount = columns.length + (actionsHeader ? 1 : 0);
  const containerClasses = ['rounded-md border bg-card/50 backdrop-blur-sm', containerClassName]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses} data-testid="ops-table">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-white/5">
            {columns.map(column => (
              <TableHead key={column.key} className={column.className}>
                {column.header}
              </TableHead>
            ))}
            {actionsHeader && <TableHead className="text-right">{actionsHeader}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell
                colSpan={colCount}
                className="text-center py-12 text-muted-foreground"
                data-testid="ops-table-loading"
              >
                Loading...
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colCount}
                className="text-center py-12 text-muted-foreground"
                data-testid="ops-table-empty"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map(row => {
              const handleClick = row.onClick;
              const rowClasses = [
                'group transition-colors',
                handleClick ? 'cursor-pointer hover:bg-muted/30' : 'hover:bg-muted/30',
                row.className,
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <TableRow
                  key={row.id}
                  className={rowClasses}
                  onClick={handleClick}
                  data-testid={row.testId ?? rowTestId ?? 'ops-table-row'}
                >
                  {row.cells.map((cell, index) => (
                    <TableCell key={`${row.id}-${index}`}>{cell}</TableCell>
                  ))}
                  {actionsHeader && (
                    <TableCell
                      className="text-right"
                      data-testid="ops-table-actions"
                      onClick={event => event.stopPropagation()}
                    >
                      {row.actions}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

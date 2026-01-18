'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@interdomestik/ui';
import type { ReactNode } from 'react';
import { OpsEmptyState } from './OpsEmptyState';
import { OpsLoadingState } from './OpsLoadingState';

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
  emptySubtitle?: string;
  loading?: boolean;
  loadingLabel?: string;
  actionsHeader?: ReactNode;
  rowTestId?: string;
  containerClassName?: string;
}

export function OpsTable({
  columns,
  rows,
  emptyLabel,
  emptySubtitle,
  loading,
  loadingLabel,
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
              <TableCell colSpan={colCount} className="p-0 border-none">
                <OpsLoadingState label={loadingLabel} testId="ops-table-loading" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="p-0 border-none">
                <OpsEmptyState
                  title={emptyLabel}
                  subtitle={emptySubtitle}
                  testId="ops-table-empty"
                />
              </TableCell>
            </TableRow>
          ) : (
            rows.map(row => {
              const handleClick = row.onClick;
              const rowClasses = [
                'group transition-colors outline-none focus-within:bg-muted/40 focus-within:ring-1 focus-within:ring-primary/20',
                handleClick ? 'cursor-pointer hover:bg-muted/30' : 'hover:bg-muted/30',
                row.className,
              ]
                .filter(Boolean)
                .join(' ');

              const handleKeyDown = (e: React.KeyboardEvent) => {
                if (handleClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleClick();
                }
              };

              return (
                <TableRow
                  key={row.id}
                  className={rowClasses}
                  onClick={handleClick}
                  onKeyDown={handleKeyDown}
                  tabIndex={handleClick ? 0 : undefined}
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

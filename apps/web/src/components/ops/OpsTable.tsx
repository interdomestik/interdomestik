'use client';

import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { OpsEmptyState } from './OpsEmptyState';
import { OpsLoadingState } from './OpsLoadingState';
import { OPS_TEST_IDS } from './testids';

export type OpsTableColumn = {
  key: string;
  header: ReactNode;
  className?: string;
};

export type OpsTableRow = {
  id: string;
  cells: ReactNode[];
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
  testId?: string;
};

export interface OpsTableProps {
  columns: OpsTableColumn[];
  rows: OpsTableRow[];
  emptyLabel: string;
  emptySubtitle?: string;
  loading?: boolean;
  loadingLabel?: string;
  error?: boolean;
  onRetry?: () => void;
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
  error,
  onRetry,
  actionsHeader,
  rowTestId,
  containerClassName,
}: OpsTableProps) {
  const colCount = columns.length + (actionsHeader ? 1 : 0);
  const containerClasses = ['rounded-md border bg-card/50 backdrop-blur-sm', containerClassName]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClasses} data-testid={OPS_TEST_IDS.TABLE.ROOT}>
      <div className="overflow-x-auto">
        <Table className="min-w-max">
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
                  <OpsLoadingState label={loadingLabel} testId={OPS_TEST_IDS.TABLE.LOADING} />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={colCount} className="h-64 text-center border-none">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <span>Failed to load data</span>
                    {onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
                        <RefreshCw className="mr-2 h-4 w-4" /> Try Again
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="p-0 border-none">
                  <OpsEmptyState
                    title={emptyLabel}
                    subtitle={emptySubtitle}
                    testId={OPS_TEST_IDS.TABLE.EMPTY}
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
                    data-testid={row.testId ?? rowTestId ?? OPS_TEST_IDS.TABLE.ROW}
                  >
                    {row.cells.map((cell, index) => (
                      <TableCell key={`${row.id}-${index}`} className="h-14 sm:h-12 py-2">
                        {cell}
                      </TableCell>
                    ))}
                    {actionsHeader && (
                      <TableCell
                        className="text-right h-14 sm:h-12 py-2"
                        data-testid={OPS_TEST_IDS.TABLE.ACTIONS}
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
    </div>
  );
}

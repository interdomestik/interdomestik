'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { CashVerificationRequestDTO } from '../../server/types';
import { ProofCell } from './ProofCell';
import { VerificationActions } from './VerificationActions';
import { AmountCell, BranchCell, LeadCell } from './VerificationRowCells';
import { VerificationStatusSpine } from './VerificationStatusSpine';
import { VerifierCell } from './VerifierCell';

interface VerificationTableV2Props {
  data: CashVerificationRequestDTO[];
  historyMode: boolean;
  onViewDetails: (id: string) => void;
  onAction: (id: string, decision: 'reject' | 'needs_info') => void;
  onVerify: (id: string) => void;
}

export function VerificationTableV2({
  data,
  historyMode,
  onViewDetails,
  onAction,
  onVerify,
}: VerificationTableV2Props) {
  const t = useTranslations('admin.leads');

  return (
    <div className="rounded-md border bg-card/50 backdrop-blur-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-white/5">
            <TableHead className="w-[120px]">{t('table.status')}</TableHead>
            <TableHead>{t('table.branch')}</TableHead>
            <TableHead>{t('table.lead')}</TableHead>
            <TableHead>{t('table.proof')}</TableHead>
            <TableHead>{t('table.amount')}</TableHead>
            {historyMode && <TableHead>{t('table.verifier')}</TableHead>}
            {!historyMode && <TableHead className="text-right">{t('table.actions')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                {t('empty_state')}
              </TableCell>
            </TableRow>
          ) : (
            data.map(req => (
              <TableRow
                key={req.id}
                data-testid="cash-verification-row"
                className="group transition-colors hover:bg-muted/30"
              >
                <TableCell className="py-3 pl-4">
                  <VerificationStatusSpine
                    status={req.status}
                    isResubmission={req.isResubmission}
                    compact
                  />
                </TableCell>
                <TableCell>
                  <BranchCell request={req} />
                </TableCell>
                <TableCell>
                  <LeadCell request={req} />
                </TableCell>
                <TableCell>
                  <ProofCell request={req} />
                </TableCell>
                <TableCell>
                  <AmountCell request={req} />
                </TableCell>
                {historyMode && (
                  <TableCell>
                    <VerifierCell request={req} />
                  </TableCell>
                )}
                {!historyMode && (
                  <TableCell className="text-right pr-4">
                    <VerificationActions
                      id={req.id}
                      onViewDetails={onViewDetails}
                      onVerify={onVerify}
                      onAction={onAction}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { OpsTable } from '@/components/ops';
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

  const columns = [
    { key: 'status', header: t('table.status'), className: 'w-[120px]' },
    { key: 'branch', header: t('table.branch') },
    { key: 'lead', header: t('table.lead') },
    { key: 'proof', header: t('table.proof') },
    { key: 'amount', header: t('table.amount') },
  ];

  if (historyMode) {
    columns.push({ key: 'verifier', header: t('table.verifier') });
  }

  const rows = data.map(req => ({
    id: req.id,
    testId: 'cash-verification-row',
    dataAttributes: {
      'data-lead-name': `${req.firstName} ${req.lastName}`,
      'data-email': req.email,
    },
    onClick: () => onViewDetails(req.id),
    cells: [
      <div key={`${req.id}-status`} className="py-3 pl-4">
        <VerificationStatusSpine status={req.status} isResubmission={req.isResubmission} compact />
      </div>,
      <BranchCell key={`${req.id}-branch`} request={req} />,
      <LeadCell key={`${req.id}-lead`} request={req} />,
      <ProofCell key={`${req.id}-proof`} request={req} />,
      <AmountCell key={`${req.id}-amount`} request={req} />,
      ...(historyMode ? [<VerifierCell key={`${req.id}-verifier`} request={req} />] : []),
    ],
    actions: historyMode ? null : (
      <VerificationActions
        id={req.id}
        onViewDetails={onViewDetails}
        onVerify={onVerify}
        onAction={onAction}
      />
    ),
  }));

  return (
    <OpsTable
      columns={columns}
      rows={rows}
      emptyLabel={t('empty_state')}
      actionsHeader={historyMode ? undefined : t('table.actions')}
    />
  );
}

import { CaseSummaryCard, type CaseSummaryCardProps } from './accident-case-summary';

export type GenericCaseSummaryProps = CaseSummaryCardProps;

export function GenericCaseSummary(props: GenericCaseSummaryProps) {
  return <CaseSummaryCard {...props} />;
}

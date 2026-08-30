import { AccidentCaseSummary, type AccidentCaseSummaryProps } from './accident-case-summary';

export type GenericCaseSummaryProps = AccidentCaseSummaryProps;

export function GenericCaseSummary(props: GenericCaseSummaryProps) {
  return <AccidentCaseSummary {...props} />;
}

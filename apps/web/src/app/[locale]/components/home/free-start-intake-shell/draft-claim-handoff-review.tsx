import type { RefObject } from 'react';
import type { useTranslations } from 'next-intl';

import { Link } from '@/i18n/routing';

export type HandoffFacts = {
  category: 'vehicle' | 'property';
  counterparty: string;
  desiredOutcome: string;
  incidentDate: string;
  issueType: string;
  summary: string;
  version: number;
};
export type HandoffCopy = {
  action: string;
  alreadyCreated: string;
  authorityTruth: string;
  claimLink: string;
  confirm: string;
  confirming: string;
  created: string;
  deleteIndependent: string;
  draftChanged: string;
  facts: Record<keyof Omit<HandoffFacts, 'version'>, string>;
  heading: string;
  intro: string;
  membershipRequired: string;
  sourceRetained: string;
  unavailable: string;
};

export const parseHandoffCopy = (value: unknown): HandoffCopy =>
  (typeof value === 'string' ? JSON.parse(value) : value) as HandoffCopy;

export function LinkedDraftClaim(props: {
  claimId: string;
  copy: HandoffCopy;
  created: boolean;
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section className="mt-4 border-t border-[#001a33]/10 pt-4" aria-labelledby={props.headingId}>
      <h5
        ref={props.headingRef}
        tabIndex={-1}
        id={props.headingId}
        className="font-bold text-[#001a33] outline-none"
      >
        {props.created ? props.copy.created : props.copy.alreadyCreated}
      </h5>
      <p className="mt-2 text-sm leading-6 text-[#526274]">{props.copy.deleteIndependent}</p>
      <Link
        href={`/member/claims/${props.claimId}`}
        className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-[#006f72] px-4 text-sm font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
      >
        {props.copy.claimLink}
      </Link>
    </section>
  );
}

export function HandoffReview(props: {
  confirm: () => void;
  copy: HandoffCopy;
  error: string;
  facts: HandoffFacts | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  id: string;
  state: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div id={props.id} className="mt-4" aria-labelledby={`${props.id}-heading`}>
      <h5
        ref={props.headingRef}
        id={`${props.id}-heading`}
        tabIndex={-1}
        className="font-bold text-[#001a33] outline-none"
      >
        {props.copy.heading}
      </h5>
      <p className="mt-2 text-sm leading-6 text-[#526274]">{props.copy.intro}</p>
      {props.state === 'loading' ? (
        <p role="status" className="mt-3 text-sm">
          {props.copy.heading}…
        </p>
      ) : null}
      {props.facts ? <FactReview facts={props.facts} copy={props.copy} t={props.t} /> : null}
      {props.error ? (
        <p role="alert" tabIndex={-1} className="mt-3 text-sm font-bold text-[#8a2f43]">
          {props.error}
        </p>
      ) : null}
      {props.facts ? (
        <>
          <p className="mt-4 text-sm leading-6 text-[#33485c]">{props.copy.sourceRetained}</p>
          <p className="mt-2 text-sm font-bold leading-6 text-[#001a33]">
            {props.copy.authorityTruth}
          </p>
          <button
            type="button"
            onClick={props.confirm}
            disabled={props.state === 'confirming'}
            aria-busy={props.state === 'confirming'}
            className="mt-4 min-h-11 w-full rounded-xl bg-[#006f72] px-4 text-sm font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2 sm:w-auto"
          >
            {props.state === 'confirming' ? props.copy.confirming : props.copy.confirm}
          </button>
        </>
      ) : null}
    </div>
  );
}

function FactReview({
  facts,
  copy,
  t,
}: {
  facts: HandoffFacts;
  copy: HandoffCopy;
  t: ReturnType<typeof useTranslations>;
}) {
  const values = {
    category: t(`categories.${facts.category}.title`),
    issueType: t(`issues.${facts.category}.${facts.issueType}`),
    incidentDate: facts.incidentDate,
    counterparty: facts.counterparty,
    desiredOutcome: t(`outcomes.${facts.desiredOutcome}`),
    summary: facts.summary,
  };
  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      {Object.entries(values).map(([key, value]) => (
        <div key={key} className="min-w-0 rounded-xl bg-[#f5f8fa] p-3">
          <dt className="text-xs font-bold uppercase tracking-wide text-[#526274]">
            {copy.facts[key as keyof typeof values]}
          </dt>
          <dd className="mt-1 break-words text-sm text-[#001a33]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

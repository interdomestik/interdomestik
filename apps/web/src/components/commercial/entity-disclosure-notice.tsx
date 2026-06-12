export type EntityDisclosureNoticeModel = {
  contractingCompany: string | null;
  governingLaw: string | null;
  unavailable: boolean;
};

type EntityDisclosureNoticeLabels = {
  title: string;
  contractingCompany: string;
  governingLaw: string;
  unavailableTitle: string;
  unavailableBody: string;
};

type EntityDisclosureNoticeProps = Readonly<{
  disclosure?: EntityDisclosureNoticeModel | null;
  labels: EntityDisclosureNoticeLabels;
  testId: string;
}>;

export function EntityDisclosureNotice({
  disclosure,
  labels,
  testId,
}: EntityDisclosureNoticeProps) {
  const contractingCompany = disclosure?.contractingCompany ?? null;
  const governingLaw = disclosure?.governingLaw ?? null;
  const unavailable = !disclosure || disclosure.unavailable || !contractingCompany || !governingLaw;

  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left"
    >
      {unavailable ? (
        <>
          <h3 className="text-sm font-semibold text-slate-950">{labels.unavailableTitle}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{labels.unavailableBody}</p>
        </>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-slate-950">{labels.title}</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                {labels.contractingCompany}
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{contractingCompany}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">
                {labels.governingLaw}
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{governingLaw}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}

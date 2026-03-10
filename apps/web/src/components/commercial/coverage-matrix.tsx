import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';

export type CoverageCellTone =
  | 'included'
  | 'escalation'
  | 'referral'
  | 'laterPhase'
  | 'unavailable';

export type CoverageCell = Readonly<{
  label: string;
  tone: CoverageCellTone;
}>;

export type CoverageMatrixRow = Readonly<{
  cells: readonly CoverageCell[];
  description: string;
  title: string;
}>;

export type CoverageMatrixProps = Readonly<{
  columns: readonly string[];
  eyebrow?: string;
  footerBody: string;
  footerTitle: string;
  rowHeaderTitle: string;
  rows: readonly CoverageMatrixRow[];
  sectionTestId?: string;
  subtitle: string;
  title: string;
}>;

const TONE_CLASS_NAMES: Record<CoverageCellTone, string> = {
  included: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  escalation: 'border-sky-200 bg-sky-50 text-sky-800',
  referral: 'border-amber-200 bg-amber-50 text-amber-800',
  laterPhase: 'border-slate-200 bg-slate-100 text-slate-700',
  unavailable: 'border-rose-200 bg-rose-50 text-rose-800',
};

function CoverageCellBadge({ label, tone }: CoverageCell) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${TONE_CLASS_NAMES[tone]}`}
    >
      {label}
    </span>
  );
}

export function CoverageMatrix({
  columns,
  eyebrow,
  footerBody,
  footerTitle,
  rowHeaderTitle,
  rows,
  sectionTestId,
  subtitle,
  title,
}: CoverageMatrixProps) {
  return (
    <section
      className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8"
      data-testid={sectionTestId}
    >
      <div className="mx-auto max-w-4xl text-center">
        {eyebrow ? (
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
        ) : null}
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base">{subtitle}</p>
      </div>

      <div className="mt-8 hidden overflow-hidden rounded-[1.75rem] border border-slate-200 md:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                {rowHeaderTitle}
              </th>
              {columns.map(column => (
                <th
                  key={column}
                  className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-slate-500"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rows.map(row => (
              <tr key={row.title} className="align-top">
                <th scope="row" className="px-5 py-5 text-left">
                  <div className="max-w-sm">
                    <div className="text-base font-black text-slate-950">{row.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{row.description}</p>
                  </div>
                </th>
                {row.cells.map(cell => (
                  <td key={`${row.title}-${cell.label}`} className="px-5 py-5">
                    <CoverageCellBadge {...cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-4 md:hidden">
        {rows.map(row => (
          <Card key={row.title} className="rounded-[1.75rem] border border-slate-200 shadow-none">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl font-black text-slate-950">{row.title}</CardTitle>
              <p className="text-sm leading-6 text-slate-600">{row.description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {row.cells.map((cell, index) => (
                <div
                  key={`${row.title}-${columns[index]}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    {columns[index]}
                  </span>
                  <CoverageCellBadge {...cell} />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-slate-900 bg-slate-950 px-6 py-5 text-white">
        <h3 className="text-lg font-black">{footerTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-200">{footerBody}</p>
      </div>
    </section>
  );
}

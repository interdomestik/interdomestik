type CommercialDisclaimerItem = Readonly<{
  body: string;
  title: string;
}>;

type CommercialDisclaimerNoticeProps = Readonly<{
  eyebrow?: string;
  items: readonly CommercialDisclaimerItem[];
  sectionTestId?: string;
}>;

export function CommercialDisclaimerNotice({
  eyebrow,
  items,
  sectionTestId,
}: CommercialDisclaimerNoticeProps) {
  return (
    <section
      className="rounded-[1.75rem] border border-amber-200 bg-amber-50/70 p-5 shadow-sm md:p-6"
      data-testid={sectionTestId}
    >
      {eyebrow ? (
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-800">{eyebrow}</p>
      ) : null}

      <div className={`grid gap-4 ${items.length > 1 ? 'mt-4 md:grid-cols-2' : 'mt-2'}`}>
        {items.map(item => (
          <div
            key={item.title}
            className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm"
          >
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-900">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

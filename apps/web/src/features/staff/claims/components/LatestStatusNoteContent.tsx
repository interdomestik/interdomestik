export function LatestStatusNoteContent({
  latestStatusNote,
  emptyLabel,
  locale,
}: {
  readonly latestStatusNote: { note: string | null; createdAt: Date | null } | null;
  readonly emptyLabel: string;
  readonly locale: string;
}) {
  if (!latestStatusNote?.note) return <p className="text-muted-foreground">{emptyLabel}</p>;
  return (
    <>
      <p className="whitespace-pre-wrap text-slate-900">{latestStatusNote.note}</p>
      <p className="text-xs text-muted-foreground">
        {latestStatusNote.createdAt
          ? new Date(latestStatusNote.createdAt).toLocaleString(locale)
          : ''}
      </p>
    </>
  );
}

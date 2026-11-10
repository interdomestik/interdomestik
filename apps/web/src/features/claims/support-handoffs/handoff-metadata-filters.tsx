export type HandoffFilterGroup = {
  name: string;
  value: string;
  label: string;
  options: Record<string, string>;
};

export function HandoffMetadataFilters({
  locale,
  search,
  groups,
  searchLabel,
  submitLabel,
}: {
  locale: string;
  search: string;
  searchLabel: string;
  submitLabel: string;
  groups: HandoffFilterGroup[];
}) {
  return (
    <form
      action={`/${locale}/staff/support-handoffs`}
      className="space-y-4"
      data-testid="staff-support-handoffs-search-form"
    >
      <label className="block" htmlFor="handoff-metadata-search">
        {searchLabel}
      </label>
      <input
        id="handoff-metadata-search"
        name="search"
        defaultValue={search}
        maxLength={80}
        data-testid="staff-support-handoffs-search-input"
        className="w-full rounded border px-3 py-2 focus-visible:outline focus-visible:outline-2"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {groups.map(group => (
          <label key={group.name} className="flex flex-col gap-2">
            {group.label}
            <select
              name={group.name}
              defaultValue={group.value}
              className="rounded border px-3 py-2 focus-visible:outline focus-visible:outline-2"
            >
              {Object.entries(group.options).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="submit"
        data-testid="staff-support-handoffs-search-submit"
        className="rounded border px-3 py-2 focus-visible:outline focus-visible:outline-2"
      >
        {submitLabel}
      </button>
    </form>
  );
}

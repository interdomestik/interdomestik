import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabsList,
  TabsTrigger,
} from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface VerificationFiltersProps {
  view?: string;
  onViewChange?: (view: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  branchFilter: string;
  onBranchFilterChange: (branchId: string) => void;
  branches: { id: string; name: string }[];
}

export function VerificationFilters({
  view,
  onViewChange,
  searchQuery,
  onSearchChange,
  branchFilter,
  onBranchFilterChange,
  branches,
}: VerificationFiltersProps) {
  const t = useTranslations('admin.leads');

  // We are handling Tabs rendering slightly differently here.
  // The 'children' prop will be the content, which expects us to render TabsContent inside.
  // But wait, Tabs component requires TabsContent as direct children usually or nested.
  // Actually, standard Tabs usage wraps everything.
  // Let's make this component just render the CONTROLS (List, Search, Select)
  // and let the parent handle the Tabs wrapping if possible, OR
  // pass the content slots.
  // Ease of use: The parent `VerificationList` uses `Tabs` to wrap the table.
  // So this component should probably just be the "Toolbar".
  // But maintaining the Tab state is handled by the parent via URL or state.
  // Code in `VerificationList` uses `Tabs` component from UI library which has local state or controlled state.

  // Let's make `VerificationToolbar` that renders the top part.
  // But `TabsList` needs to be inside `Tabs`.
  // So the parent should render `Tabs` and this component should be inside `Tabs`?
  // `TabsList` must be inside `Tabs`.
  // Refactoring strategy: `VerificationList` keeps the `Tabs` root.
  // This component will render the `TabsList` and the search/filter inputs.

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <TabsList>
        <TabsTrigger value="queue">{t('tabs.queue')}</TabsTrigger>
        <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
      </TabsList>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <div className="relative w-full sm:w-[250px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('placeholders.search')}
            className="pl-8"
            defaultValue={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>
        <Select value={branchFilter} onValueChange={onBranchFilterChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('filters.branch_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all_branches')}</SelectItem>
            {branches.map(b => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

'use client';

import { listLeadsAction } from '@/actions/leads/dashboard';
import { CreateLeadDialog } from '@/features/agent/leads/components/CreateLeadDialog';
import { Lead, LeadsTable } from '@/features/agent/leads/components/LeadsTable';
import { Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export function AgentLeadsClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const fetchLeads = async () => {
    try {
      const res = await listLeadsAction({ search: search || undefined });
      if (res.success) {
        setLeads(res.data as Lead[]);
      }
    } catch (error) {
      console.error('Failed to fetch leads', error);
    }
  };

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(async () => {
      setIsSearching(true);
      await fetchLeads();
      setIsSearching(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search leads..."
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <CreateLeadDialog onSuccess={fetchLeads} />
      </div>

      <LeadsTable leads={leads} isLoading={isSearching} onUpdate={fetchLeads} />
    </div>
  );
}

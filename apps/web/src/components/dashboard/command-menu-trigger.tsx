'use client';

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@interdomestik/ui';
import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

export function CommandMenuTrigger() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const searchKey = useMemo(() => {
    if (pathname?.includes('/agent/members')) {
      return 'q';
    }
    return 'search';
  }, [pathname]);

  useEffect(() => {
    const current = searchParams.get(searchKey) || '';
    setQuery(current);
  }, [searchKey, searchParams]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(open => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) {
      params.set(searchKey, query.trim());
    } else {
      params.delete(searchKey);
    }
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start rounded-[0.5rem] bg-background/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <span className="hidden lg:inline-flex">Search...</span>
        <span className="inline-flex lg:hidden">Search...</span>
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              placeholder="Search..."
              onChange={event => setQuery(event.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit">Search</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

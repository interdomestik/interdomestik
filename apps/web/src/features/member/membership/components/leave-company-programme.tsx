'use client';

import { leaveCompanyProgramme } from '@/app/[locale]/(app)/member/membership/leave-sponsorship.core';
import { useRouter } from '@/i18n/routing';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@interdomestik/ui';
import { useRef, useState } from 'react';

export function LeaveCompanyProgramme({
  entryId,
  t,
}: Readonly<{
  entryId: string;
  t: (key: string) => string;
}>): React.JSX.Element {
  const router = useRouter();
  const pendingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const status = statuses[entryId] ?? null;
  const left = status === 'success';
  const setStatus = (value: string): void => {
    setStatuses(previous => ({ ...previous, [entryId]: value }));
  };
  const leave = async () => {
    if (pendingRef.current || left) return;
    pendingRef.current = true;
    setPending(true);
    setStatus('');
    try {
      const result = await leaveCompanyProgramme({ entryId });
      let nextStatus = 'success';
      if (!result.ok) nextStatus = result.error === 'not_found' ? 'not_found' : 'error';
      setStatus(nextStatus);
      if (result.ok) {
        router.refresh();
      }
    } catch {
      setStatus('error');
    } finally {
      pendingRef.current = false;
      setPending(false);
      setOpen(false);
    }
  };
  return (
    <div>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!pending) setOpen(value);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" disabled={pending || left}>
            {t('sponsorCoverage.leave')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sponsorCoverage.leave')}</DialogTitle>
            <DialogDescription>{t('sponsorCoverage.confirm_body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              {t('sponsorCoverage.keep')}
            </Button>
            <Button variant="destructive" disabled={pending} aria-busy={pending} onClick={leave}>
              {t(pending ? 'sponsorCoverage.pending' : 'sponsorCoverage.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p role="status" aria-live="polite" className="mt-2 text-sm">
        {status ? t(`sponsorCoverage.${status}`) : ''}
      </p>
    </div>
  );
}

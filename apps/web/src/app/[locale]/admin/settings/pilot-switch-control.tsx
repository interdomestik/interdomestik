'use client';

import type { loadPilotSwitches } from '@/actions/admin-settings/pilot-switches.core';
import { setPilotSwitch } from '@/actions/admin-settings/set-pilot-switch';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Input } from '@interdomestik/ui/components/input';
import { Label } from '@interdomestik/ui/components/label';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition, type FormEvent } from 'react';

export type PilotSwitchControlProps = {
  pilotSwitches: Awaited<ReturnType<typeof loadPilotSwitches>>;
};

type Message = 'saved' | 'failed' | 'conflict';

export function PilotSwitchControl({ pilotSwitches }: PilotSwitchControlProps) {
  const t = useTranslations('admin.settings_page.pilot');
  const id = useId();
  const [switches, setSwitches] = useState(pilotSwitches);
  const [selected, setSelected] = useState(pilotSwitches?.[0]?.key);
  const [message, setMessage] = useState<Message>();
  const [isPending, startTransition] = useTransition();
  const current = switches?.find(item => item.key === selected);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || isPending || message === 'conflict') return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const approvalReference = values.get('approvalReference');
    setMessage(undefined);
    startTransition(async () => {
      try {
        const result = await setPilotSwitch({
          key: current.key,
          enabled: current.state === 'closed',
          expectedRevision: current.revision,
          reason: values.get('reason'),
          ...(approvalReference ? { approvalReference } : {}),
        });
        if (!result.success) {
          setMessage(result.code === 'CONFLICT' ? 'conflict' : 'failed');
          return;
        }
        if (!result.data) {
          setMessage('failed');
          return;
        }
        const saved = result.data;
        setSwitches(
          previous =>
            previous?.map(item => (item.key === current.key ? { ...item, ...saved } : item)) ?? null
        );
        form.reset();
        setMessage('saved');
      } catch {
        setMessage('failed');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {current && switches ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-switch`}>{t('switch')}</Label>
              <select
                id={`${id}-switch`}
                className="border-input bg-background w-full rounded-md border p-2"
                value={current.key}
                disabled={isPending || message === 'conflict'}
                onChange={event => {
                  const next = switches.find(item => item.key === event.target.value);
                  if (next) {
                    setSelected(next.key);
                    setMessage(undefined);
                  }
                }}
              >
                {switches.map(item => (
                  <option key={item.key} value={item.key}>
                    {t(item.key)}
                  </option>
                ))}
              </select>
              <span>{t(current.state)}</span>
            </div>
            <form key={current.key} onSubmit={submit} aria-busy={isPending}>
              <fieldset disabled={isPending || message === 'conflict'} className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-reason`}>{t('reason')}</Label>
                  <Input
                    id={`${id}-reason`}
                    name="reason"
                    minLength={10}
                    maxLength={500}
                    required
                  />
                </div>
                {current.state === 'closed' && (
                  <div className="grid gap-2">
                    <Label htmlFor={`${id}-approval`}>{t('approval')}</Label>
                    <Input
                      id={`${id}-approval`}
                      name="approvalReference"
                      maxLength={200}
                      required
                    />
                  </div>
                )}
                <Button type="submit">
                  {t(current.state === 'closed' ? 'open_switch' : 'close_switch')}
                </Button>
              </fieldset>
            </form>
          </>
        ) : (
          <p role="alert">{t('unavailable')}</p>
        )}
        {isPending && <p role="status">{t('pending')}</p>}
        {message && <p role={message === 'saved' ? 'status' : 'alert'}>{t(message)}</p>}
        {(!current || message === 'conflict') && (
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            {t('reload')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

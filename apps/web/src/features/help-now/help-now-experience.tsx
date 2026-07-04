'use client';

import { createHelpNowIncidentScenePack } from '@interdomestik/domain-assistance';
import { Car, Home, Plane, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  HELP_NOW_COUNTRY_PACKS,
  HELP_NOW_SCENARIOS,
  canExposeCountryPack,
  getDefaultHelpNowCountry,
  getHelpNowContentLocale,
  getHelpNowCountryPack,
  getSignedOffHelpNowPacks,
  type HelpNowCountry,
  type HelpNowScenario,
} from './content-packs';
import { getHelpNowCopy } from './copy';
import { listEvidenceItems } from './evidence-store';
import { trackHelpNowEvent } from './analytics';
import { ClaimPackPreview } from './claim-pack-preview';
import { EvidenceCoach } from './evidence-coach';
import { SceneGuide } from './scene-guide';
import { TripMode } from './trip-mode';

type HelpNowExperienceProps = {
  locale: string;
};

const icons = [Car, ShieldAlert, Home, Plane] as const;

export function HelpNowExperience({ locale }: HelpNowExperienceProps) {
  const contentLocale = getHelpNowContentLocale(locale);
  const copy = getHelpNowCopy(contentLocale);
  const [completed, setCompleted] = useState<number[]>([]);
  const [evidenceCount, setEvidenceCount] = useState(0);
  const [country, setCountry] = useState<HelpNowCountry>(() =>
    getDefaultHelpNowCountry(contentLocale)
  );
  const [scenario, setScenario] = useState<HelpNowScenario>('car');
  const updateEvidenceCount = useCallback((count: number) => setEvidenceCount(count), []);
  const signedOffPacks = getSignedOffHelpNowPacks();
  const countryPack = getHelpNowCountryPack(country);
  const pack = canExposeCountryPack(countryPack)
    ? createHelpNowIncidentScenePack({
        packId: 'mob-01-help-now-public-preview',
        sessionId: 'anonymous-help-now-public',
        guidanceChecklist: copy.checklist.map((_, index) => `scene_${index}`),
        escalationRecommendation: 'member_zone',
        createdAt: '2026-07-04T00:00:00.000Z',
        country,
      })
    : null;

  useEffect(() => {
    setEvidenceCount(listEvidenceItems().length);
    trackHelpNowEvent('help_now_opened', { country, offline: !navigator.onLine });
  }, [country]);

  return (
    <main
      className="min-h-screen bg-[#f7f4ee] text-slate-950"
      data-testid="help-now-page-ready"
      data-scope="public-no-account"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-5 sm:py-8">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold uppercase text-emerald-800">{copy.offline}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-slate-950">{copy.title}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{copy.subtitle}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {copy.scenarios.map((label, index) => {
              const Icon = icons[index] ?? ShieldAlert;
              const value = HELP_NOW_SCENARIOS[index] ?? 'car';
              const isDisabled = value === 'flight';
              const isSelected = scenario === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={isDisabled}
                  aria-pressed={!isDisabled ? isSelected : undefined}
                  onClick={() => setScenario(value)}
                  className={`flex min-h-20 items-center gap-4 rounded-lg border px-4 text-left text-lg font-semibold ${
                    isSelected
                      ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
                      : 'border-slate-200 bg-slate-50 text-slate-950'
                  } ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <Icon className="h-7 w-7 text-slate-700" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
          <label className="mt-5 block max-w-sm text-sm font-semibold text-slate-800">
            Trip country
            <select
              className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              value={country}
              onChange={event => setCountry(event.currentTarget.value as HelpNowCountry)}
            >
              {HELP_NOW_COUNTRY_PACKS.map(pack => (
                <option key={pack.country} value={pack.country}>
                  {pack.marketLabel}
                </option>
              ))}
            </select>
          </label>
        </section>

        <SceneGuide
          copy={copy}
          completed={completed}
          country={country}
          scenario={scenario}
          onToggle={index =>
            setCompleted(current =>
              current.includes(index)
                ? current.filter(value => value !== index)
                : [...current, index]
            )
          }
        />
        <EvidenceCoach copy={copy} onBundleChange={updateEvidenceCount} />
        <TripMode copy={copy} country={country} packs={signedOffPacks} />
        <ClaimPackPreview
          copy={copy}
          pack={pack}
          completedCount={completed.length}
          country={country}
          evidenceCount={evidenceCount}
          scenario={scenario}
        />
      </div>
    </main>
  );
}

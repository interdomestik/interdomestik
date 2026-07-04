'use client';

import type { HelpNowCopy } from './copy';
import { trackHelpNowEvent } from './analytics';
import type { HelpNowCountry, HelpNowScenario } from './content-packs';
import { HelpNowPanel } from './help-now-ui';

type SceneGuideProps = Readonly<{
  copy: HelpNowCopy;
  completed: readonly number[];
  country: HelpNowCountry;
  scenario: HelpNowScenario;
  onToggle: (index: number) => void;
}>;

export function SceneGuide({ copy, completed, country, scenario, onToggle }: SceneGuideProps) {
  return (
    <section className="space-y-4" aria-labelledby="help-now-scene-title">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-950">
        <h2 id="help-now-scene-title" className="text-lg font-semibold">
          {copy.emergency}
        </h2>
      </div>
      <HelpNowPanel>
        <p className="font-semibold text-slate-950">{copy.continueSafe}</p>
        <ul className="mt-4 space-y-2">
          {copy.checklist.map((item, index) => {
            const done = completed.includes(index);
            return (
              <li key={`scene-${index}`}>
                <button
                  type="button"
                  data-testid={`help-now-checklist-${index}`}
                  onClick={() => {
                    onToggle(index);
                    if (!done) {
                      trackHelpNowEvent('checklist_item_done', {
                        checklist_type: 'scene',
                        country,
                        item_index: index,
                        scenario,
                      });
                    }
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-800"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                      done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
                    }`}
                  >
                    {done ? '✓' : index + 1}
                  </span>
                  {item}
                </button>
              </li>
            );
          })}
        </ul>
      </HelpNowPanel>
    </section>
  );
}

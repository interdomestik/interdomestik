'use client';

import type { CreateClaimValues } from '@/lib/validators/claims';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@interdomestik/ui/components/form';
import { Input } from '@interdomestik/ui/components/input';
import { Textarea } from '@interdomestik/ui/components/textarea';
import { useFormContext } from 'react-hook-form';

import { VoiceRecorder } from '@/components/ui/voice-recorder';
import { useTranslations } from 'next-intl';

export function WizardStepDetails() {
  const form = useFormContext<CreateClaimValues>();
  const t = useTranslations('wizard.details');
  const tInstructions = useTranslations('wizard.categoryInstructions');
  const tFields = useTranslations('wizard.categoryFields');

  const category = form.watch('category');
  const validCategories = ['vehicle', 'property', 'injury', 'travel'] as const;
  type ValidCategory = (typeof validCategories)[number];
  const hasCategory = category && validCategories.includes(category as ValidCategory);
  const safeCategory = hasCategory ? (category as ValidCategory) : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center fade-in slide-in-from-right-4 duration-500">
        <h2 className="text-2xl font-bold tracking-tight">
          {hasCategory ? tInstructions(`${safeCategory}.title`) : t('title')}
        </h2>
        <p className="text-muted-foreground mt-2">
          {hasCategory ? tInstructions(`${safeCategory}.subtitle`) : t('subtitle')}
        </p>
        {hasCategory && (
          <div className="mt-4 p-4 bg-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/20 rounded-lg text-sm text-left">
            <p className="font-medium text-[hsl(var(--primary))] mb-1">{t('helpfulTips')}</p>
            <p className="text-muted-foreground">{tInstructions(`${safeCategory}.tips`)}</p>
          </div>
        )}
      </div>

      <div className="grid gap-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('claim_title')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    hasCategory
                      ? tFields(`${safeCategory}.titlePlaceholder`)
                      : t('claim_title_placeholder')
                  }
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {hasCategory ? tFields(`${safeCategory}.titleDesc`) : t('claim_title_desc')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('company')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    hasCategory
                      ? tFields(`${safeCategory}.companyPlaceholder`)
                      : t('company_placeholder')
                  }
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="claimAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('amount')}</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="200" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('currency')}</FormLabel>
                <FormControl>
                  <Input placeholder="EUR" disabled {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="incidentDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('date')}</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('description')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={
                    hasCategory
                      ? tFields(`${safeCategory}.descriptionPlaceholder`)
                      : t('description_placeholder')
                  }
                  className="min-h-[120px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="border-t pt-6 mt-2">
          <FormLabel className="mb-3 font-medium flex items-center gap-2">
            {t('voice_note_label', { defaultMessage: 'Or Record a Voice Message' })}
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">New</span>
          </FormLabel>
          <VoiceRecorder
            onRecordingComplete={async (blob: Blob) => {
              const formData = new FormData();
              formData.append('file', blob, 'voicenote.webm');

              const { toast } = await import('sonner');
              const loader = toast.loading('Uploading voice note...');

              try {
                const { uploadVoiceNote } = await import('@/actions/uploads/upload');
                const result = await uploadVoiceNote(formData);

                if (result.success) {
                  form.setValue('voiceNoteUrl', result.url);
                  toast.success('Voice note attached!', { id: loader });
                } else {
                  toast.error('Upload failed: ' + result.error, { id: loader });
                }
              } catch {
                toast.error('Upload failed', { id: loader });
              }
            }}
            onClear={() => {
              form.setValue('voiceNoteUrl', undefined);
            }}
          />
          <p className="text-xs text-muted-foreground mt-2">
            {t('voice_note_desc', {
              defaultMessage: 'Skip typing. Explain what happened in 60 seconds.',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

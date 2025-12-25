'use client';

import { Button } from '@interdomestik/ui/components/button';
import { Textarea } from '@interdomestik/ui/components/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export function NpsSurveyForm({ token }: { token: string }) {
  const t = useTranslations('nps');
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitted' | 'already' | 'error'>('idle');

  const scores = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);

  async function onSubmit() {
    if (score === null) return;

    setIsSubmitting(true);
    setStatus('idle');

    try {
      const res = await fetch('/api/public/nps', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, score, comment: comment.trim() || undefined }),
      });

      const data = (await res.json()) as { success?: boolean; alreadySubmitted?: boolean };
      if (res.ok && data.success) {
        setStatus(data.alreadySubmitted ? 'already' : 'submitted');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === 'submitted') {
    return <p className="text-sm">{t('thanks')}</p>;
  }

  if (status === 'already') {
    return <p className="text-sm">{t('alreadySubmitted')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('question')}</p>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
          {scores.map(value => (
            <Button
              key={value}
              type="button"
              variant={score === value ? 'default' : 'outline'}
              onClick={() => setScore(value)}
              disabled={isSubmitting}
              className="px-0"
            >
              {value}
            </Button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{t('labelLow')}</span>
          <span>{t('labelHigh')}</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="comment">
          {t('commentLabel')}
        </label>
        <Textarea
          id="comment"
          value={comment}
          onChange={e => setComment(e.target.value)}
          disabled={isSubmitting}
          placeholder={t('commentPlaceholder')}
        />
      </div>

      {status === 'error' && <p className="text-sm text-destructive">{t('submitError')}</p>}

      <Button type="button" onClick={onSubmit} disabled={isSubmitting || score === null}>
        {isSubmitting ? t('submitting') : t('submit')}
      </Button>
    </div>
  );
}

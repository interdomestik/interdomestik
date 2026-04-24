/**
 * Claim Pack result display component.
 *
 * Rendered inside the Free Start intake shell after pack generation
 * completes. Shows the full ClaimPack: confidence score, evidence
 * checklist, complaint letter draft, timeline, and recommended
 * next step.
 */
'use client';

import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  Download,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Link } from '@/i18n/routing';

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function confidenceColor(level: ClaimPack['confidence']['level']) {
  switch (level) {
    case 'high':
      return {
        border: 'border-emerald-300/40',
        bg: 'bg-emerald-300/10',
        text: 'text-emerald-100',
        fill: 'bg-emerald-400',
      };
    case 'medium':
      return {
        border: 'border-amber-300/40',
        bg: 'bg-amber-300/10',
        text: 'text-amber-100',
        fill: 'bg-amber-400',
      };
    case 'low':
      return {
        border: 'border-rose-300/40',
        bg: 'bg-rose-300/10',
        text: 'text-rose-100',
        fill: 'bg-rose-400',
      };
  }
}

function evidenceIcon(item: ClaimPack['evidenceChecklist']['items'][number]) {
  if (item.likelyAvailable) {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />;
  }

  if (item.required) {
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />;
  }

  return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />;
}

function evidenceTextClass(item: ClaimPack['evidenceChecklist']['items'][number]) {
  if (item.likelyAvailable) {
    return 'text-slate-200';
  }

  if (item.required) {
    return 'text-amber-100 font-medium';
  }

  return 'text-slate-400';
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function ConfidenceSection({ confidence }: Readonly<{ confidence: ClaimPack['confidence'] }>) {
  const colors = confidenceColor(confidence.level);

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-cyan-300" />
          <h3 className="text-base font-semibold text-white">Confidence Score</h3>
        </div>
        <span
          data-testid="claim-pack-confidence-level"
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${colors.border} ${colors.bg} ${colors.text}`}
        >
          {confidence.level} – {confidence.score}/100
        </span>
      </div>

      {/* Factor breakdown */}
      <div className="space-y-2">
        {confidence.factors.map(factor => (
          <div key={factor.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">{factor.name}</span>
              <span className="font-medium text-slate-100">
                {factor.pointsEarned}/{factor.maxPoints}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-800">
              <div
                className={`h-1.5 rounded-full transition-all ${colors.fill}`}
                style={{ width: `${(factor.pointsEarned / factor.maxPoints) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">{factor.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence checklist
// ---------------------------------------------------------------------------

function EvidenceSection({ checklist }: Readonly<{ checklist: ClaimPack['evidenceChecklist'] }>) {
  return (
    <div
      data-testid="claim-pack-evidence"
      className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 space-y-3"
    >
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-cyan-300" />
        <h3 className="text-base font-semibold text-white">Evidence Checklist</h3>
      </div>
      <p className="text-xs text-slate-400">
        {checklist.likelyAvailableCount} of {checklist.requiredCount} required items likely
        available
      </p>
      <ul className="space-y-2">
        {checklist.items.map(item => (
          <li key={item.id} className="flex items-start gap-3 text-sm leading-6">
            {evidenceIcon(item)}
            <div>
              <span className={evidenceTextClass(item)}>
                {item.name}
                {item.required && !item.likelyAvailable && (
                  <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
                    Required
                  </span>
                )}
              </span>
              <p className="text-xs text-slate-400">{item.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Letter preview
// ---------------------------------------------------------------------------

function LetterSection({ letter }: Readonly<{ letter: ClaimPack['letter'] }>) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    setCopyError(null);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(letter.body);
      } else if (!fallbackCopyText(letter.body)) {
        throw new Error('Copy command was unsuccessful.');
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (fallbackCopyText(letter.body)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }

      setCopied(false);
      setCopyError('Unable to copy the letter. Select the text and copy it manually.');
    }
  }, [letter.body]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([letter.body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'complaint-letter.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [letter.body]);

  return (
    <div
      data-testid="claim-pack-letter"
      className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-cyan-300" />
          <h3 className="text-base font-semibold text-white">Draft Letter</h3>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      </div>

      {letter.placeholders.length > 0 && (
        <p className="text-xs text-amber-200">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          Fill in the highlighted placeholders before sending:
          <span className="ml-1 font-mono text-amber-100">
            {letter.placeholders.slice(0, 3).join(', ')}
            {letter.placeholders.length > 3 && '…'}
          </span>
        </p>
      )}
      {copyError && <p className="text-xs text-rose-200">{copyError}</p>}

      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-xs leading-6 text-slate-200 font-mono scrollbar-thin scrollbar-thumb-slate-700">
        {letter.body}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function TimelineSection({ timeline }: Readonly<{ timeline: ClaimPack['timeline'] }>) {
  return (
    <div
      data-testid="claim-pack-timeline"
      className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 space-y-3"
    >
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-cyan-300" />
        <h3 className="text-base font-semibold text-white">Estimated Timeline</h3>
      </div>
      <div className="relative ml-2 space-y-4 border-l border-slate-700 pl-6">
        {timeline.milestones.map(m => (
          <div key={m.id} className="relative">
            <div className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-cyan-400 bg-slate-950" />
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-white">{m.label}</span>
                <span className="text-xs font-medium text-cyan-200">{m.estimatedRange}</span>
              </div>
              <p className="text-xs text-slate-400">{m.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommended next step
// ---------------------------------------------------------------------------

function NextStepSection({
  ctaHref,
  ctaLabel,
  step,
}: Readonly<{
  ctaHref?: string;
  ctaLabel?: string;
  step: ClaimPack['recommendedNextStep'];
}>) {
  const colors = confidenceColor(step.level);
  const resolvedCtaHref = ctaHref ?? step.ctaHref;
  const resolvedCtaLabel = ctaLabel ?? step.ctaLabel;

  return (
    <div
      data-testid="claim-pack-next-step"
      className={`rounded-3xl border p-5 space-y-3 ${colors.border} ${colors.bg}`}
    >
      <h3 className="text-lg font-semibold text-white">{step.title}</h3>
      <p className="text-sm leading-6 text-slate-200">{step.description}</p>
      <Link
        href={resolvedCtaHref}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
      >
        {resolvedCtaLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export type ClaimPackResultProps = Readonly<{
  ctaHref?: string;
  ctaLabel?: string;
  pack: ClaimPack;
}>;

export function ClaimPackResult({ ctaHref, ctaLabel, pack }: Readonly<ClaimPackResultProps>) {
  return (
    <div data-testid="claim-pack-result" className="space-y-4">
      <ConfidenceSection confidence={pack.confidence} />
      <NextStepSection ctaHref={ctaHref} ctaLabel={ctaLabel} step={pack.recommendedNextStep} />
      <EvidenceSection checklist={pack.evidenceChecklist} />
      <LetterSection letter={pack.letter} />
      <TimelineSection timeline={pack.timeline} />

      {/* Disclaimer */}
      <p className="text-[10px] leading-5 text-slate-500">{pack.disclaimer}</p>
    </div>
  );
}

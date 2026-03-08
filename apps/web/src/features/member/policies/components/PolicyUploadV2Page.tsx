'use client';

import { useRouter } from '@/i18n/routing';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@interdomestik/ui';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, Upload } from 'lucide-react';
import { startTransition, useEffect, useEffectEvent, useState } from 'react';
import { toast } from 'sonner';

type WorkflowState = 'queued' | 'processing' | 'completed' | 'needs_review' | 'failed';

type QueuedPolicyAnalysis = {
  policyId?: string;
  runId?: string;
  status?: string;
  workflowState?: WorkflowState;
  reviewStatus?: string;
  warnings?: string[];
  extraction?: Record<string, unknown> | null;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

type StatusPresentation = {
  title: string;
  description: string;
  className: string;
  icon: React.ReactNode;
};

type StatusTone = 'amber' | 'blue' | 'emerald' | 'red';

type StaticStatusConfig = {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  tone: StatusTone;
};

function isTerminalWorkflowState(state: WorkflowState | undefined) {
  return state === 'completed' || state === 'needs_review' || state === 'failed';
}

const STATUS_TONE_CLASS_NAMES: Record<StatusTone, string> = {
  amber: 'border-amber-500 bg-amber-50 dark:bg-amber-950/10',
  blue: 'border-blue-500 bg-blue-50 dark:bg-blue-950/10',
  emerald: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/10',
  red: 'border-red-500 bg-red-50 dark:bg-red-950/10',
};

const STATIC_STATUS_CONFIG: Record<Exclude<WorkflowState, 'failed'>, StaticStatusConfig> = {
  queued: {
    title: 'Analysis Queued',
    description:
      'Your policy was uploaded successfully and is now waiting for background processing to start.',
    icon: Clock3,
    iconClassName: 'h-5 w-5 text-amber-600',
    tone: 'amber',
  },
  processing: {
    title: 'Analysis In Progress',
    description:
      'Your policy is being analyzed in the background. This usually completes in under a minute.',
    icon: Loader2,
    iconClassName: 'h-5 w-5 animate-spin text-blue-600',
    tone: 'blue',
  },
  completed: {
    title: 'Analysis Complete',
    description: 'Your policy analysis finished successfully. Refresh to see the latest details.',
    icon: CheckCircle2,
    iconClassName: 'h-5 w-5 text-emerald-600',
    tone: 'emerald',
  },
  needs_review: {
    title: 'Needs Review',
    description:
      'The AI found policy details, but a reviewer still needs to confirm a few items before this is considered final.',
    icon: AlertCircle,
    iconClassName: 'h-5 w-5 text-amber-600',
    tone: 'amber',
  },
};

function createStatusPresentation({
  title,
  description,
  icon: Icon,
  iconClassName,
  tone,
}: StaticStatusConfig): StatusPresentation {
  return {
    title,
    description,
    className: STATUS_TONE_CLASS_NAMES[tone],
    icon: <Icon className={iconClassName} />,
  };
}

function getStatusPresentation(run: QueuedPolicyAnalysis): StatusPresentation {
  const workflowState = run.workflowState ?? 'queued';

  if (workflowState === 'failed') {
    return {
      title: 'Analysis Failed',
      description:
        run.errorMessage ||
        'The background run did not complete. You can upload the document again to retry.',
      className: STATUS_TONE_CLASS_NAMES.red,
      icon: <AlertCircle className="h-5 w-5 text-red-600" />,
    };
  }

  return createStatusPresentation(STATIC_STATUS_CONFIG[workflowState]);
}

export function PolicyUploadV2Page() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [queuedRun, setQueuedRun] = useState<QueuedPolicyAnalysis | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setQueuedRun(null);
    }
  };

  const refreshQueuedRun = useEffectEvent(async (runId: string) => {
    if (isTerminalWorkflowState(queuedRun?.workflowState)) {
      return;
    }

    try {
      const res = await fetch(`/api/ai/runs/${runId}`, {
        method: 'GET',
      });

      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as QueuedPolicyAnalysis;
      startTransition(() => {
        setQueuedRun(current => {
          if (current?.runId !== runId) {
            return current;
          }

          return {
            ...current,
            ...data,
          };
        });
      });
    } catch (error) {
      console.error('Failed to refresh queued run:', error);
    }
  });

  useEffect(() => {
    const runId = queuedRun?.runId;
    if (!runId) {
      return;
    }

    const refreshCurrentRun = () => {
      refreshQueuedRun(runId).catch(error => {
        console.error('Unexpected queued run refresh failure:', error);
      });
    };

    refreshCurrentRun();
    const intervalId = globalThis.setInterval(refreshCurrentRun, 3000);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [queuedRun?.runId, refreshQueuedRun]);

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/policies/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to analyze policy');
      }

      const data = await res.json();
      setQueuedRun(data);
      toast.success('Policy queued for AI analysis.');
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to analyze policy';
      toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const statusPresentation = queuedRun ? getStatusPresentation(queuedRun) : null;

  return (
    <div className="container max-w-2xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Policy Parser</h1>
        <p className="text-muted-foreground mt-2">
          Upload your insurance policy (PDF). Our AI will read it to find hidden coverage and perks.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
          <CardDescription>Supported formats: PDF, JPEG, PNG, WebP</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="policy">Policy File</Label>
            <Input
              id="policy"
              type="file"
              accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleFileChange}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleAnalyze} disabled={!file || isAnalyzing}>
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Analyze Policy
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {queuedRun && statusPresentation && (
        <Card className={statusPresentation.className}>
          <CardHeader>
            <div className="flex items-center gap-2">
              {statusPresentation.icon}
              <CardTitle>{statusPresentation.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{statusPresentation.description}</p>
            {queuedRun.runId && (
              <div className="rounded-md border bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">Run ID:</span>{' '}
                <span className="font-mono">{queuedRun.runId}</span>
              </div>
            )}
            {queuedRun.warnings && queuedRun.warnings.length > 0 && (
              <div className="rounded-md border bg-background px-3 py-3 text-sm">
                <p className="font-medium">Warnings</p>
                <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                  {queuedRun.warnings.map(warning => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setFile(null);
                  setQueuedRun(null);
                }}
              >
                Upload Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

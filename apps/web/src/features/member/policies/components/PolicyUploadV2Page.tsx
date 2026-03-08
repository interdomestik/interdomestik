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
import { Clock3, Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

type QueuedPolicyAnalysis = {
  policyId?: string;
  runId?: string;
  status?: string;
};

export function PolicyUploadV2Page() {
  useTranslations('Dashboard'); // Assuming generic dashboard translations for now
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

      {queuedRun && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-amber-600" />
              <CardTitle>Analysis Queued</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your policy was uploaded successfully and is now being processed in the background.
              Refresh the policies page shortly to see extracted details.
            </p>
            {queuedRun.runId && (
              <div className="rounded-md border bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">Run ID:</span>{' '}
                <span className="font-mono">{queuedRun.runId}</span>
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

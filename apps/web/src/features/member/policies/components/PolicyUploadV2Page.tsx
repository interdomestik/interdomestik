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
import { CheckCircle, Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

type PolicyAnalysis = {
  provider?: string;
  policyNumber?: string | null;
  coverageAmount?: number | string;
  currency?: string;
  deductible?: number | string;
  hiddenPerks?: string[];
  summary?: string;
};

export function PolicyUploadV2Page() {
  useTranslations('Dashboard'); // Assuming generic dashboard translations for now
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PolicyAnalysis | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setAnalysisResult(null);
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
      setAnalysisResult(data.analysis);
      toast.success('Policy analyzed successfully!');
      // Optionally redirect or show result there
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

      {analysisResult && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <CardTitle>Analysis Complete</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Provider</Label>
                <div className="font-semibold">{analysisResult.provider}</div>
              </div>
              <div>
                <Label>Policy Number</Label>
                <div className="font-semibold">{analysisResult.policyNumber || 'N/A'}</div>
              </div>
              <div>
                <Label>Coverage</Label>
                <div className="font-semibold">
                  {analysisResult.coverageAmount} {analysisResult.currency}
                </div>
              </div>
              <div>
                <Label>Deductible</Label>
                <div className="font-semibold">
                  {analysisResult.deductible} {analysisResult.currency}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-blue-600 font-bold">Hidden Perks Found</Label>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {analysisResult.hiddenPerks?.map(perk => (
                  <li key={perk} className="text-sm font-medium">
                    {perk}
                  </li>
                ))}
              </ul>
            </div>

            {analysisResult.summary && (
              <div className="bg-white dark:bg-zinc-900 p-4 rounded-md border text-sm italic">
                "{analysisResult.summary}"
              </div>
            )}

            <div className="pt-4">
              <Button variant="outline" className="w-full" onClick={() => setFile(null)}>
                Upload Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

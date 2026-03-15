'use client';

import { importMembers } from '@/lib/actions/agent';
import {
  parseMemberImportCsv,
  type ParsedMemberImportRow,
} from '@/features/agent/import/lib/parse-member-import-csv';
import { Button } from '@interdomestik/ui/components/button';
import { Input } from '@interdomestik/ui/components/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { CloudUpload, FileText, Loader2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useActionState, useRef, useState } from 'react';
import { toast } from 'sonner';

const initialState = {
  error: '',
  summary: undefined as
    | {
        total: number;
        imported: number;
        failed: number;
      }
    | undefined,
  results: undefined as
    | Array<{
        index: number;
        email: string;
        fullName: string;
        ok: boolean;
        error?: string;
      }>
    | undefined,
};

export function CSVUploader() {
  const [serverState, action, pending] = useActionState(importMembers, initialState);
  const [rows, setRows] = useState<ParsedMemberImportRow[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validRows = rows
    .filter(row => row.isValid)
    .map(({ fullName, email, phone, password, planId }) => ({
      fullName,
      email,
      phone,
      password,
      planId,
    }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      toast.error('Please upload a valid CSV file');
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      const text = event.target?.result as string;
      const parsed = parseMemberImportCsv(text);

      setHeaderErrors(parsed.headerErrors);
      setRows(parsed.rows);

      if (parsed.headerErrors.length > 0) {
        toast.error(parsed.headerErrors[0]);
        return;
      }

      toast.success(`Parsed ${parsed.rows.length} rows`);
    };
    reader.readAsText(file);
  };

  const clearData = () => {
    setRows([]);
    setHeaderErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (rows.length > 0) {
    return (
      <form action={action} className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
        <input type="hidden" name="rowsJson" value={JSON.stringify(validRows)} />

        {serverState.error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {serverState.error}
          </div>
        )}

        {serverState.summary && (
          <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Imported {serverState.summary.imported} of {serverState.summary.total} members
            {serverState.summary.failed > 0 ? ` (${serverState.summary.failed} failed)` : ''}
          </div>
        )}

        {headerErrors.length > 0 && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {headerErrors[0]}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            <span className="font-bold">{rows.length} members found in file</span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearData} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear and Start Over
          </Button>
        </div>

        <div className="rounded-xl border overflow-hidden max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} className={!row.isValid ? 'bg-red-500/5' : ''}>
                  <TableCell>
                    {row.isValid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{row.fullName}</TableCell>
                  <TableCell>{row.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{row.email || '-'}</TableCell>
                  <TableCell className="capitalize">{row.planId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={clearData}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending || validRows.length === 0 || headerErrors.length > 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Sponsored Seat Import ({validRows.length} members)
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/20 rounded-3xl p-12 transition-colors hover:border-primary/40 cursor-pointer group"
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        accept=".csv"
        onChange={handleFileChange}
      />
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform mb-4">
        <CloudUpload className="h-8 w-8" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold">Upload Sponsored Member Roster</h3>
        <p className="text-muted-foreground max-w-xs">
          Upload a CSV with fullName, email, phone, password, and optional planId to reserve
          sponsored seats for activation.
        </p>
      </div>
    </div>
  );
}

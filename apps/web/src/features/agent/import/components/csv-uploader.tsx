'use client';

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
import { useState, useRef } from 'react';
import { toast } from 'sonner';

interface MemberRow {
  fullName: string;
  phone: string;
  email: string;
  plateNumber: string;
  isValid: boolean;
  error?: string;
}

export function CSVUploader() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

      const parsedRows: MemberRow[] = lines
        .slice(1)
        .filter(line => line.trim())
        .map(line => {
          const values = line.split(',').map(v => v.trim());
          const rowData: any = {};
          headers.forEach((header, i) => {
            rowData[header] = values[i];
          });

          const isValid = !!(rowData.fullname && rowData.phone && rowData.platenumber);

          return {
            fullName: rowData.fullname || '',
            phone: rowData.phone || '',
            email: rowData.email || '',
            plateNumber: rowData.platenumber || '',
            isValid,
            error: !isValid ? 'Missing required fields' : undefined,
          };
        });

      setRows(parsedRows);
      toast.success(`Parsed ${parsedRows.length} rows`);
    };
    reader.readAsText(file);
  };

  const clearData = () => {
    setRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    setIsProcessing(true);
    // Mock processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // In real app: call server action bulkRegisterMembers(rows.filter(r => r.isValid))

    toast.success(`Successfully imported ${rows.filter(r => r.isValid).length} members`);
    setIsProcessing(false);
    setRows([]);
  };

  if (rows.length > 0) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
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
                <TableHead>Plate</TableHead>
                <TableHead>Email</TableHead>
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
                  <TableCell>{row.plateNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{row.email || '-'}</TableCell>
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
            disabled={isProcessing || rows.every(r => !r.isValid)}
            onClick={handleImport}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Bulk Registration ({rows.filter(r => r.isValid).length} members)
          </Button>
        </div>
      </div>
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
        <h3 className="text-xl font-bold">Upload Client List</h3>
        <p className="text-muted-foreground max-w-xs">
          Drag and drop your CSV file here, or click to browse your computer.
        </p>
      </div>
    </div>
  );
}

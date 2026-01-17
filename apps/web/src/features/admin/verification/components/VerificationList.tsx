'use client';

import { verifyCashAttemptAction } from '../actions/verification';
import { type CashVerificationRequestDTO } from '../server/verification.core';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Label,
  Textarea,
} from '@interdomestik/ui';
import { Check, Info, Shield, X, Filter, FileText, HelpCircle } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export function VerificationList({ initialLeads }: { initialLeads: CashVerificationRequestDTO[] }) {
  const t = useTranslations('admin.leads');
  const [requests, setRequests] = useState(initialLeads);
  const [branchFilter, setBranchFilter] = useState<string>('all');

  // Needs Info Dialog State
  const [needsInfoOpen, setNeedsInfoOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Derive unique branches for filter
  const branches = useMemo(() => {
    const unique = new Map();
    initialLeads.forEach(r => {
      unique.set(r.branchId, r.branchName);
    });
    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [initialLeads]);

  const filteredRequests = useMemo(() => {
    if (branchFilter === 'all') return requests;
    return requests.filter(r => r.branchId === branchFilter);
  }, [requests, branchFilter]);

  const totalAmount = filteredRequests.reduce((sum, r) => sum + r.amount, 0);

  const handleVerify = async (
    attemptId: string,
    decision: 'approve' | 'reject' | 'needs_info',
    note?: string
  ) => {
    const res = await verifyCashAttemptAction({
      attemptId,
      decision,
      note,
    });

    if (res.success) {
      toast.success(t(`toasts.${decision}_success`));
      // Optimistic update
      setRequests(prev => prev.filter(r => r.id !== attemptId));
    } else {
      toast.error(res.error || t('toasts.error'));
    }
  };

  const openNeedsInfo = (id: string) => {
    setSelectedId(id);
    setNote('');
    setNeedsInfoOpen(true);
  };

  const submitNeedsInfo = async () => {
    if (!selectedId) return;
    if (!note.trim()) {
      toast.error(t('toasts.note_required'));
      return;
    }
    await handleVerify(selectedId, 'needs_info', note);
    setNeedsInfoOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Stats & Filters */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.pending_count')}</CardTitle>
            <Info className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.pending_value')}</CardTitle>
            <span className="text-xs text-muted-foreground">EUR</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(totalAmount / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('filters.branch_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all_branches')}</SelectItem>
              {branches.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.branch')}</TableHead>
              <TableHead>{t('table.lead')}</TableHead>
              <TableHead>{t('table.agent')}</TableHead>
              <TableHead>{t('table.proof')}</TableHead>
              <TableHead>{t('table.amount')}</TableHead>
              <TableHead className="text-right">{t('table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {t('empty_state')}
                </TableCell>
              </TableRow>
            ) : (
              filteredRequests.map(req => (
                <TableRow key={req.id} data-testid="cash-verification-row">
                  <TableCell>
                    <div className="flex flex-col">
                      <Badge variant="outline" className="w-fit mb-1">
                        {req.branchCode}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{req.branchName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {req.firstName} {req.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{req.email}</div>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2 cursor-help w-fit">
                            <Shield className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm">{req.agentName}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{req.agentEmail}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    {req.documentPath ? (
                      <Button variant="ghost" size="sm" asChild className="h-8">
                        <a
                          href={`/api/documents/${req.documentId}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileText className="w-4 h-4 mr-2 text-blue-600" />
                          <span className="text-blue-600 underline-offset-4 hover:underline">
                            {t('actions.view_proof')}
                          </span>
                        </a>
                      </Button>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-yellow-600 border-yellow-600 bg-yellow-50"
                      >
                        {t('labels.missing_proof')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-bold text-green-600">
                    {(req.amount / 100).toLocaleString('de-DE', {
                      style: 'currency',
                      currency: req.currency,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50"
                        onClick={() => handleVerify(req.id, 'approve')}
                        data-testid="cash-approve"
                      >
                        <Check className="w-4 h-4 mr-1" /> {t('actions.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openNeedsInfo(req.id)}
                        data-testid="cash-needs-info"
                      >
                        <HelpCircle className="w-4 h-4 mr-1" /> {t('actions.needs_info')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleVerify(req.id, 'reject')} // Reject can also have note? Yes, but usually needs info is for fixing. Reject is final? Prompt says "rejected ... and note".
                        // Should reject also open modal? Or simple reject?
                        // Usually Rejection requires reason too.
                        // I'll make Reject require note too?
                        // Prompt requirement 2: "Verification item can be set to NEEDS_INFO with a required note".
                        // Requirement 3: "Audit trail: ... note".
                        // It doesn't explicitly say Reject requires note, but it's good practice.
                        // I'll keep Reject simple for now as per previous implementation, but maybe add optional note?
                        // For this iteration, I'll stick to Needs Info having the modal.
                        data-testid="cash-reject"
                      >
                        <X className="w-4 h-4 mr-1" /> {t('actions.reject')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={needsInfoOpen} onOpenChange={setNeedsInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialogs.needs_info_title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>{t('labels.note')}</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('placeholders.needs_info_note')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNeedsInfoOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={submitNeedsInfo}>{t('actions.submit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

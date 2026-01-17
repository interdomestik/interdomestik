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
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@interdomestik/ui';
import {
  Check,
  Info,
  Shield,
  X,
  FileText,
  HelpCircle,
  Search,
  Clock,
  UserCheck,
  MessageSquare,
} from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function VerificationList({
  initialLeads,
  initialParams,
}: {
  initialLeads: CashVerificationRequestDTO[];
  initialParams: { view: 'queue' | 'history'; query: string };
}) {
  const t = useTranslations('admin.leads');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [requests, setRequests] = useState(initialLeads);
  const [branchFilter, setBranchFilter] = useState<string>('all');

  // Sync prop to state
  useEffect(() => {
    setRequests(initialLeads);
  }, [initialLeads]);

  // Needs Info Dialog State
  const [needsInfoOpen, setNeedsInfoOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Search Debounce
  const debounceRef = useRef<NodeJS.Timeout>(null);
  const handleSearch = (term: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (term) params.set('query', term);
      else params.delete('query');
      router.replace(`${pathname}?${params.toString()}`);
    }, 300);
  };

  const handleTabChange = (val: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', val);
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Derive unique branches for filter
  const branches = useMemo(() => {
    const unique = new Map();
    requests.forEach(r => {
      unique.set(r.branchId, r.branchName);
    });
    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [requests]);

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            {t('status.succeeded')}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">{t('status.rejected')}</Badge>
        );
      case 'needs_info':
        return (
          <Badge className="bg-orange-100 text-orange-700 border-orange-200">
            {t('status.needs_info')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{t('status.pending')}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats & Filters */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.count')}</CardTitle>
            <Info className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.total_value')}</CardTitle>
            <span className="text-xs text-muted-foreground">EUR</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(totalAmount / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Tabs defaultValue={initialParams.view} onValueChange={handleTabChange} className="w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <TabsList>
              <TabsTrigger value="queue">{t('tabs.queue')}</TabsTrigger>
              <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-[250px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('placeholders.search')}
                  className="pl-8"
                  defaultValue={initialParams.query}
                  onChange={e => handleSearch(e.target.value)}
                />
              </div>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-[180px]">
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

          <TabsContent value="queue" className="mt-0">
            {/* Queue Table */}
            {renderTable(filteredRequests, false)}
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            {/* History Table */}
            {renderTable(filteredRequests, true)}
          </TabsContent>
        </Tabs>
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

  function renderTable(data: CashVerificationRequestDTO[], historyMode: boolean) {
    return (
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.branch')}</TableHead>
              <TableHead>{t('table.lead')}</TableHead>
              <TableHead>{t('table.agent')}</TableHead>
              <TableHead>{t('table.proof')}</TableHead>
              <TableHead>{t('table.amount')}</TableHead>
              {historyMode && <TableHead>{t('table.status')}</TableHead>}
              {historyMode && <TableHead>{t('table.verifier')}</TableHead>}
              {historyMode && <TableHead>{t('table.date')}</TableHead>}
              {!historyMode && <TableHead className="text-right">{t('table.actions')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={historyMode ? 8 : 6}
                  className="text-center py-12 text-muted-foreground"
                >
                  {t('empty_state')}
                </TableCell>
              </TableRow>
            ) : (
              data.map(req => (
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

                  {historyMode && (
                    <>
                      <TableCell>{getStatusBadge(req.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-3 h-3 text-muted-foreground" />
                          <span className="text-sm">{req.verifierName || '-'}</span>
                        </div>
                        {req.verificationNote && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 cursor-help">
                                  <MessageSquare className="w-3 h-3" />
                                  <span className="truncate max-w-[100px]">
                                    {req.verificationNote}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[300px]">
                                <p>{req.verificationNote}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(req.updatedAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                    </>
                  )}

                  {!historyMode && (
                    <TableCell className="text-right">
                      {req.status === 'needs_info' ? (
                        <div className="flex justify-end gap-2 items-center">
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                            {t('status.needs_info')}
                          </Badge>
                          {/* Allow re-decision? Yes, Approve or Reject final */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVerify(req.id, 'approve')}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
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
                            onClick={() => handleVerify(req.id, 'reject')}
                            data-testid="cash-reject"
                          >
                            <X className="w-4 h-4 mr-1" /> {t('actions.reject')}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    );
  }
}

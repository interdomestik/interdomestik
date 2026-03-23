'use client';

import {
  getAllCommissions,
  getGlobalCommissionSummary,
  updateCommissionStatus,
} from '@/actions/commissions.admin';
import { Commission, CommissionStatus, CommissionSummary } from '@/actions/commissions.types';
import {
  getMemberReferralProgramSettings,
  listMemberReferralRewards,
  updateMemberReferralProgramSettings,
  updateMemberReferralRewardStatus,
  type MemberReferralAdminRewardRow,
  type MemberReferralProgramSettings,
} from '@/actions/member-referrals';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Input,
  Label,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui';
import { format } from 'date-fns';
import { Check, Clock, DollarSign } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

const EMPTY_REFERRAL_SETTINGS: MemberReferralProgramSettings = {
  tenantId: '',
  enabled: false,
  rewardType: 'fixed',
  fixedRewardCents: 0,
  percentRewardBps: null,
  settlementMode: 'credit_only',
  payoutThresholdCents: 0,
  fraudReviewEnabled: false,
  currencyCode: 'EUR',
  qualifyingEventType: 'first_paid_membership',
};

const REFERRAL_STATUS_TRANSITIONS: Record<
  MemberReferralAdminRewardRow['status'],
  Array<MemberReferralAdminRewardRow['status']>
> = {
  pending: ['approved', 'void'],
  approved: ['credited', 'paid', 'void'],
  credited: ['paid', 'void'],
  paid: [],
  void: [],
};

export default function AdminCommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [referralRewards, setReferralRewards] = useState<MemberReferralAdminRewardRow[]>([]);
  const [referralSettings, setReferralSettings] =
    useState<MemberReferralProgramSettings>(EMPTY_REFERRAL_SETTINGS);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    const [commResult, sumResult, settingsResult, rewardsResult] = await Promise.all([
      getAllCommissions(),
      getGlobalCommissionSummary(),
      getMemberReferralProgramSettings(),
      listMemberReferralRewards({ limit: 50 }),
    ]);
    if (commResult.success && commResult.data) setCommissions(commResult.data);
    if (sumResult.success && sumResult.data) setSummary(sumResult.data);
    if (settingsResult.success && settingsResult.data) {
      setReferralSettings(settingsResult.data);
    }
    if (rewardsResult.success && rewardsResult.data) {
      setReferralRewards(rewardsResult.data);
    }
  }

  function handleStatusChange(id: string, newStatus: CommissionStatus) {
    startTransition(async () => {
      const result = await updateCommissionStatus(id, newStatus);
      if (result.success) {
        await loadData();
      }
    });
  }

  function handleReferralStatusChange(
    rewardId: string,
    newStatus: MemberReferralAdminRewardRow['status']
  ) {
    startTransition(async () => {
      const result = await updateMemberReferralRewardStatus(rewardId, newStatus);
      if (result.success) {
        await loadData();
      }
    });
  }

  function handleSettingsChange<Key extends keyof MemberReferralProgramSettings>(
    key: Key,
    value: MemberReferralProgramSettings[Key]
  ) {
    setReferralSettings(current => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSaveReferralSettings() {
    startTransition(async () => {
      const result = await updateMemberReferralProgramSettings({
        enabled: referralSettings.enabled,
        rewardType: referralSettings.rewardType,
        fixedRewardCents:
          referralSettings.rewardType === 'fixed' ? referralSettings.fixedRewardCents : 0,
        percentRewardBps:
          referralSettings.rewardType === 'percent' ? referralSettings.percentRewardBps : null,
        settlementMode: referralSettings.settlementMode,
        payoutThresholdCents: referralSettings.payoutThresholdCents,
        fraudReviewEnabled: referralSettings.fraudReviewEnabled,
        currencyCode: referralSettings.currencyCode,
        qualifyingEventType: referralSettings.qualifyingEventType,
      });

      if (result.success && result.data) {
        setReferralSettings(result.data);
      }
    });
  }

  const formatAmount = (amount: string, currency = 'EUR') => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(
      Number.parseFloat(amount)
    );
  };

  const formatRewardAmount = (reward: MemberReferralAdminRewardRow) =>
    new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: reward.currencyCode,
    }).format(reward.rewardCents / 100);

  const formatSettingsAmount = (amountCents: number) =>
    new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: referralSettings.currencyCode || 'EUR',
    }).format(amountCents / 100);

  const availableReferralStatusOptions = (status: MemberReferralAdminRewardRow['status']) => {
    const nextStatuses = REFERRAL_STATUS_TRANSITIONS[status] ?? [];
    return [status, ...nextStatuses];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commission Management</h1>
        <p className="text-muted-foreground">
          Review agent commissions, member referral rewards, and program settings
        </p>
      </div>

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="text-2xl font-bold">€{summary.totalPending.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{summary.pendingCount} items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Approved</span>
              </div>
              <p className="text-2xl font-bold">€{summary.totalApproved.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{summary.approvedCount} items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-muted-foreground">Paid</span>
              </div>
              <p className="text-2xl font-bold">€{summary.totalPaid.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{summary.paidCount} items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Total Owed</span>
              </div>
              <p className="text-2xl font-bold">
                €{(summary.totalPending + summary.totalApproved).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.pendingCount + summary.approvedCount} items
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Member Referral Program Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="member-referrals-enabled">Enable member referral rewards</Label>
              <p className="text-sm text-muted-foreground">
                Allow members to earn rewards from the first paid membership they refer.
              </p>
            </div>
            <Checkbox
              id="member-referrals-enabled"
              checked={referralSettings.enabled}
              onCheckedChange={checked => handleSettingsChange('enabled', Boolean(checked))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reward-type">Reward type</Label>
              <Select
                value={referralSettings.rewardType}
                onValueChange={value =>
                  handleSettingsChange(
                    'rewardType',
                    value as MemberReferralProgramSettings['rewardType']
                  )
                }
                disabled={isPending}
              >
                <SelectTrigger id="reward-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                  <SelectItem value="percent">Percent of first payment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settlement-mode">Settlement mode</Label>
              <Select
                value={referralSettings.settlementMode}
                onValueChange={value =>
                  handleSettingsChange(
                    'settlementMode',
                    value as MemberReferralProgramSettings['settlementMode']
                  )
                }
                disabled={isPending}
              >
                <SelectTrigger id="settlement-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_only">Credit only</SelectItem>
                  <SelectItem value="credit_or_payout">Credit or payout</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {referralSettings.rewardType === 'fixed' ? (
              <div className="space-y-2">
                <Label htmlFor="fixed-reward-cents">Fixed reward (cents)</Label>
                <Input
                  id="fixed-reward-cents"
                  type="number"
                  min={0}
                  value={referralSettings.fixedRewardCents}
                  onChange={event =>
                    handleSettingsChange('fixedRewardCents', Number(event.target.value) || 0)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Current reward: {formatSettingsAmount(referralSettings.fixedRewardCents)}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="percent-reward-bps">Percent reward (bps)</Label>
                <Input
                  id="percent-reward-bps"
                  type="number"
                  min={0}
                  max={10000}
                  value={referralSettings.percentRewardBps ?? 0}
                  onChange={event =>
                    handleSettingsChange('percentRewardBps', Number(event.target.value) || 0)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Current reward: {((referralSettings.percentRewardBps ?? 0) / 100).toFixed(2)}%
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="payout-threshold-cents">Payout threshold (cents)</Label>
              <Input
                id="payout-threshold-cents"
                type="number"
                min={0}
                value={referralSettings.payoutThresholdCents}
                onChange={event =>
                  handleSettingsChange('payoutThresholdCents', Number(event.target.value) || 0)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency-code">Currency code</Label>
              <Input
                id="currency-code"
                maxLength={3}
                value={referralSettings.currencyCode}
                onChange={event =>
                  handleSettingsChange('currencyCode', event.target.value.toUpperCase())
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qualifying-event-type">Qualifying event</Label>
              <Select
                value={referralSettings.qualifyingEventType}
                onValueChange={value =>
                  handleSettingsChange(
                    'qualifyingEventType',
                    value as MemberReferralProgramSettings['qualifyingEventType']
                  )
                }
                disabled={isPending}
              >
                <SelectTrigger id="qualifying-event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_paid_membership">First paid membership</SelectItem>
                  <SelectItem value="renewal">Renewal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="fraud-review-enabled">Fraud review required</Label>
              <p className="text-sm text-muted-foreground">
                Keep new rewards pending until admin reviews and approves them.
              </p>
            </div>
            <Checkbox
              id="fraud-review-enabled"
              checked={referralSettings.fraudReviewEnabled}
              onCheckedChange={checked =>
                handleSettingsChange('fraudReviewEnabled', Boolean(checked))
              }
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSaveReferralSettings} disabled={isPending}>
              Save referral settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Member Referral Rewards</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {referralRewards.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No referral rewards yet</p>
            ) : (
              referralRewards.map(reward => (
                <div
                  key={reward.id}
                  className="flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      Reward {reward.id.slice(0, 8)} • {formatRewardAmount(reward)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Referrer {reward.referrerMemberId.slice(0, 8)} • Referred member{' '}
                      {reward.referredMemberId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reward.qualifyingEventType.replaceAll('_', ' ')} •{' '}
                      {reward.earnedAt ? format(new Date(reward.earnedAt), 'PPP') : '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select
                      value={reward.status}
                      onValueChange={value =>
                        handleReferralStatusChange(
                          reward.id,
                          value as MemberReferralAdminRewardRow['status']
                        )
                      }
                      disabled={
                        isPending || availableReferralStatusOptions(reward.status).length < 2
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableReferralStatusOptions(reward.status).map(status => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Commissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {commissions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No commissions yet</p>
            ) : (
              commissions.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <p className="font-medium">{c.agentName}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.memberName || 'Unknown Member'} • {c.type.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.earnedAt ? format(new Date(c.earnedAt), 'PPP') : '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-lg">{formatAmount(c.amount)}</span>
                    <Select
                      value={c.status}
                      onValueChange={v => handleStatusChange(c.id, v as CommissionStatus)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="void">Void</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

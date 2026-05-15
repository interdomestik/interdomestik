'use client';

import dynamic from 'next/dynamic';

import type { FunnelMovementChartProps } from './funnel-movement-chart';
import type { PipelineAmountChartProps } from './pipeline-amount-chart';
import type { StageVelocityChartProps } from './stage-velocity-chart';

const PipelineAmountChart = dynamic<PipelineAmountChartProps>(
  () => import('./pipeline-amount-chart').then(module => module.PipelineAmountChart),
  { loading: () => null, ssr: false }
);

const FunnelMovementChart = dynamic<FunnelMovementChartProps>(
  () => import('./funnel-movement-chart').then(module => module.FunnelMovementChart),
  { loading: () => null, ssr: false }
);

const StageVelocityChart = dynamic<StageVelocityChartProps>(
  () => import('./stage-velocity-chart').then(module => module.StageVelocityChart),
  { loading: () => null, ssr: false }
);

export function PipelineAmountChartBoundary(props: PipelineAmountChartProps) {
  return <PipelineAmountChart {...props} />;
}

export function FunnelMovementChartBoundary(props: FunnelMovementChartProps) {
  return <FunnelMovementChart {...props} />;
}

export function StageVelocityChartBoundary(props: StageVelocityChartProps) {
  return <StageVelocityChart {...props} />;
}

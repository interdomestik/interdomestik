import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>This is a tooltip</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Left: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Left</Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>Tooltip on the left</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Right: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Right</Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p>Tooltip on the right</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Top: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Top</Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Tooltip on top</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Bottom</Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>Tooltip on bottom</p>
      </TooltipContent>
    </Tooltip>
  ),
};

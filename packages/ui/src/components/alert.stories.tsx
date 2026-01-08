import type { Meta, StoryObj } from '@storybook/react';
import { AlertCircle, CheckCircle2, Info as InfoIcon, Terminal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './alert';

const meta: Meta<typeof Alert> = {
  title: 'UI/Alert',
  component: Alert,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert className="w-[400px]">
      <Terminal className="h-4 w-4" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>You can add components to your app using the CLI.</AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-[400px]">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  render: () => (
    <Alert className="w-[400px] border-green-500/50 text-green-700 [&>svg]:text-green-600">
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>Success</AlertTitle>
      <AlertDescription>Your changes have been saved successfully.</AlertDescription>
    </Alert>
  ),
};

export const Info: Story = {
  render: () => (
    <Alert className="w-[400px] border-blue-500/50 text-blue-700 [&>svg]:text-blue-600">
      <InfoIcon className="h-4 w-4" />
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>This feature is currently in beta.</AlertDescription>
    </Alert>
  ),
};

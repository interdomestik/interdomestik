import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>This is the card content area.</p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>Update your account preferences.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Make changes to your account here.</p>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline">Cancel</Button>
        <Button>Save</Button>
      </CardFooter>
    </Card>
  ),
};

export const Minimal: Story = {
  render: () => (
    <Card className="w-[350px] p-6">
      <p>A simple card with just content.</p>
    </Card>
  ),
};

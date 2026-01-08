import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta: Meta<typeof Tabs> = {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Make changes to your account here. Click save when you&apos;re done.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>Account settings content goes here.</p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="password">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Change your password here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>Password settings content goes here.</p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const ThreeTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[500px]">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="p-4">
        <h3 className="font-medium">Overview</h3>
        <p className="text-sm text-muted-foreground mt-2">
          View a summary of your account activity.
        </p>
      </TabsContent>
      <TabsContent value="analytics" className="p-4">
        <h3 className="font-medium">Analytics</h3>
        <p className="text-sm text-muted-foreground mt-2">Detailed analytics and insights.</p>
      </TabsContent>
      <TabsContent value="reports" className="p-4">
        <h3 className="font-medium">Reports</h3>
        <p className="text-sm text-muted-foreground mt-2">Generate and download reports.</p>
      </TabsContent>
    </Tabs>
  ),
};

import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

const meta: Meta<typeof Sheet> = {
  title: 'UI/Sheet',
  component: Sheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Sheet>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you&apos;re done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input id="name" defaultValue="John Doe" className="col-span-3" />
          </div>
        </div>
        <SheetFooter>
          <Button type="submit">Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Choose where you want to go.</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col space-y-2 mt-4">
          <Button variant="ghost" className="justify-start">
            Dashboard
          </Button>
          <Button variant="ghost" className="justify-start">
            Settings
          </Button>
          <Button variant="ghost" className="justify-start">
            Profile
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  ),
};

export const TopSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top</Button>
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Notification</SheetTitle>
          <SheetDescription>You have a new message.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const BottomSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Cookie Preferences</SheetTitle>
          <SheetDescription>Manage your cookie settings.</SheetDescription>
        </SheetHeader>
        <SheetFooter className="mt-4">
          <Button variant="outline">Decline</Button>
          <Button>Accept All</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

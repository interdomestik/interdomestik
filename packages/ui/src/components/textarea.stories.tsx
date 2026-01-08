import type { Meta, StoryObj } from '@storybook/react';
import { Label } from './label';
import { Textarea } from './textarea';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    placeholder: {
      control: 'text',
    },
    disabled: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    placeholder: 'Type your message here.',
    className: 'w-[300px]',
  },
};

export const WithValue: Story = {
  args: {
    defaultValue: 'This is some pre-filled content in the textarea.',
    className: 'w-[300px]',
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled textarea',
    disabled: true,
    className: 'w-[300px]',
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="message">Your message</Label>
      <Textarea placeholder="Type your message here." id="message" className="w-[300px]" />
      <p className="text-sm text-muted-foreground">
        Your message will be copied to the support team.
      </p>
    </div>
  ),
};

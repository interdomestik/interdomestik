import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from './button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form';
import { Input } from './input';

const meta: Meta<typeof Form> = {
  title: 'UI/Form',
  component: Form,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof Form>;

interface FormData {
  username: string;
  email: string;
}

function FormDemo(): React.ReactElement {
  const form = useForm<FormData>({
    defaultValues: {
      username: '',
      email: '',
    },
  });

  const onSubmit = (data: FormData): void => {
    window.alert(`Form submitted: ${JSON.stringify(data)}`);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 w-[400px]">
        <FormField
          control={form.control}
          name="username"
          rules={{ required: 'Username is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="johndoe" {...field} />
              </FormControl>
              <FormDescription>This is your public display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          rules={{
            required: 'Email is required',
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: 'Invalid email address',
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="john@example.com" {...field} />
              </FormControl>
              <FormDescription>We&apos;ll never share your email.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}

export const Default: Story = {
  render: () => <FormDemo />,
};

function FormWithValidationErrors(): React.ReactElement {
  const form = useForm<FormData>({
    defaultValues: {
      username: '',
      email: 'invalid-email',
    },
  });

  // Trigger validation errors on mount
  React.useEffect(() => {
    void form.trigger();
  }, [form]);

  return (
    <Form {...form}>
      <form className="space-y-6 w-[400px]">
        <FormField
          control={form.control}
          name="username"
          rules={{ required: 'Username is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="johndoe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          rules={{
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: 'Invalid email address',
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

export const WithValidationErrors: Story = {
  render: () => <FormWithValidationErrors />,
};

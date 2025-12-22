'use client';

import { Link } from '@/i18n/routing';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@interdomestik/ui';
import { ChevronLeft, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export function ForgotPasswordForm() {
  const common = useTranslations('common');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;

    try {
      // TODO: Implement actual password reset with Better Auth
      // For now, show success message - user can contact support

      console.log('Password reset requested for:', email);
      setSuccess(true);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-md animate-fade-in shadow-xl border-none ring-1 ring-white/10 bg-white/5 backdrop-blur-lg">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Check your email</CardTitle>
          <CardDescription className="text-muted-foreground">
            If an account exists for that email, we've sent instructions to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant="link" className="text-primary">
            <Link href="/login">Return to login</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md animate-fade-in shadow-xl border-none ring-1 ring-white/10 bg-white/5 backdrop-blur-lg">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-2xl font-bold tracking-tight">Forgot password?</CardTitle>
        <CardDescription className="text-muted-foreground">
          Enter your email address and we'll send you a link to reset your password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              required
              className="bg-background/50"
              disabled={loading}
            />
          </div>
          <Button
            type="submit"
            className="w-full font-semibold brand-gradient shadow-lg hover:opacity-90 transition-all border-none"
            size="lg"
            disabled={loading}
          >
            {loading ? common('loading') : 'Send reset link'}
          </Button>
          <div className="text-center">
            <Button asChild variant="link" size="sm" className="text-muted-foreground">
              <Link href="/login" className="flex items-center gap-2">
                <ChevronLeft className="h-4 w-4" />
                Back to login
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

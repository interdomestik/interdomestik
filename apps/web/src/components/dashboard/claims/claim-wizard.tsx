'use client';

import { submitClaim } from '@/actions/claims';
import { useRouter } from '@/i18n/routing';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  Textarea,
} from '@interdomestik/ui';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  ShoppingBag,
} from 'lucide-react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

// Zod schema for validation
const claimSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  category: z.string().min(1, 'Please select a category'),
  companyName: z.string().min(2, 'Company name is required'),
  description: z.string().min(20, 'Please provide more details (min 20 characters)'),
  claimAmount: z.string().optional(),
  currency: z.string(),
});

type ClaimFormValues = z.infer<typeof claimSchema>;

const CLAIM_CATEGORIES = [
  { value: 'consumer', label: 'Consumer Goods', icon: ShoppingBag },
  { value: 'services', label: 'Services', icon: Building2 },
  { value: 'utilities', label: 'Utilities (Water, Electric)', icon: FileText },
  { value: 'telecom', label: 'Telecommunications', icon: FileText },
  { value: 'insurance', label: 'Insurance', icon: FileText },
  { value: 'employment', label: 'Employment', icon: Building2 },
  { value: 'housing', label: 'Housing/Rental', icon: Building2 },
  { value: 'financial', label: 'Financial Services', icon: FileText },
  { value: 'other', label: 'Other', icon: FileText },
];

const STEPS = [
  { id: 1, name: 'Basic Info', description: 'Describe your complaint' },
  { id: 2, name: 'Category', description: 'Choose the type of dispute' },
  { id: 3, name: 'Opposing Party', description: 'Who is involved?' },
  { id: 4, name: 'Review', description: 'Confirm and submit' },
];

export function ClaimWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isPending, startTransition] = useTransition();

  const form = useForm<ClaimFormValues>({
    resolver: zodResolver(claimSchema),
    defaultValues: {
      title: '',
      category: '',
      companyName: '',
      description: '',
      claimAmount: '',
      currency: 'EUR',
    },
  });

  const {
    register,
    formState: { errors },
    watch,
    setValue,
    trigger,
  } = form;

  const formValues = watch();

  const onSubmit = form.handleSubmit((data: ClaimFormValues) => {
    startTransition(async () => {
      await submitClaim({
        ...data,
        claimAmount: data.claimAmount || undefined,
        files: [],
      });
      router.push('/dashboard/claims');
    });
  });

  const nextStep = async () => {
    let fieldsToValidate: (keyof ClaimFormValues)[] = [];

    // Validate fields based on current step
    if (currentStep === 1) {
      fieldsToValidate = ['title', 'description'];
    } else if (currentStep === 2) {
      fieldsToValidate = ['category'];
    } else if (currentStep === 3) {
      fieldsToValidate = ['companyName'];
    }

    const isValid = await trigger(fieldsToValidate);
    if (isValid && currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const progressPercentage = (currentStep / STEPS.length) * 100;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Header */}
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            Step {currentStep} of {STEPS.length}
          </h2>
          <Badge variant="outline">{STEPS[currentStep - 1].name}</Badge>
        </div>
        <Progress value={progressPercentage} className="h-2" />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {STEPS.map(step => (
            <div
              key={step.id}
              className={`flex items-center gap-2 ${
                currentStep === step.id ? 'text-primary font-medium' : ''
              } ${currentStep > step.id ? 'text-green-600' : ''}`}
            >
              {currentStep > step.id ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2">
                  {step.id}
                </span>
              )}
              <span className="hidden md:inline">{step.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form Steps */}
      <form onSubmit={onSubmit}>
        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Give your complaint a clear title and describe what happened
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Complaint Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Defective product not refunded"
                  {...register('title')}
                />
                {errors.title && <p className="text-sm text-red-500">{errors.title.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Detailed Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the issue in detail: what happened, when it occurred, what you've tried to resolve it, etc."
                  className="min-h-[200px]"
                  {...register('description')}
                />
                <p className="text-xs text-muted-foreground">
                  Min 20 characters • Be as detailed as possible
                </p>
                {errors.description && (
                  <p className="text-sm text-red-500">{errors.description.message}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Category Selection */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Category</CardTitle>
              <CardDescription>Choose the type of complaint this relates to</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {CLAIM_CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const isSelected = formValues.category === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setValue('category', cat.value)}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all hover:border-primary/50 ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border bg-card'
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                      />
                      <span className={`text-sm font-medium ${isSelected ? 'text-primary' : ''}`}>
                        {cat.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <input type="hidden" {...register('category')} />
              {errors.category && <p className="text-sm text-red-500">{errors.category.message}</p>}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Opposing Party */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Opposing Party Information</CardTitle>
              <CardDescription>
                Who is the company or individual you have a dispute with?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company/Individual Name *</Label>
                <Input
                  id="companyName"
                  placeholder="e.g., ABC Electronics Ltd."
                  {...register('companyName')}
                />
                {errors.companyName && (
                  <p className="text-sm text-red-500">{errors.companyName.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="claimAmount">Claim Amount (Optional)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">€</span>
                    <Input
                      id="claimAmount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="pl-8"
                      {...register('claimAmount')}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The monetary value you're claiming, if applicable
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" disabled value="EUR" {...register('currency')} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Review & Submit */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Review Your Claim</CardTitle>
              <CardDescription>Please review the information before submitting</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Title</h4>
                  <p className="mt-1">{formValues.title || 'Not provided'}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Category</h4>
                  <Badge variant="secondary" className="mt-1">
                    {CLAIM_CATEGORIES.find(c => c.value === formValues.category)?.label ||
                      'Not selected'}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Company</h4>
                  <p className="mt-1">{formValues.companyName || 'Not provided'}</p>
                </div>
                {formValues.claimAmount && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground">Amount</h4>
                    <p className="mt-1 font-semibold">
                      €{parseFloat(formValues.claimAmount).toFixed(2)}
                    </p>
                  </div>
                )}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Description</h4>
                  <p className="mt-1 text-sm whitespace-pre-wrap">
                    {formValues.description || 'Not provided'}
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-900">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>📋 Next Steps:</strong> After submission, our team will review your claim
                  within 24-48 hours. You'll be able to track progress in your dashboard.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1 || isPending}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>

          {currentStep < STEPS.length ? (
            <Button type="button" onClick={nextStep} disabled={isPending}>
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Claim
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

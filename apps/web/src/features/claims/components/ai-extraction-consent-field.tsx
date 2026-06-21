'use client';

import { Checkbox, Label } from '@interdomestik/ui';

export function AiExtractionConsentField({
  checked,
  disabled,
  id,
  label,
  onCheckedChange,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly id: string;
  readonly label: string;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={value => onCheckedChange(value === true)}
        disabled={disabled}
      />
      <Label htmlFor={id} className="text-sm leading-5">
        {label}
      </Label>
    </div>
  );
}

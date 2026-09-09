"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel: string;
};

export function PendingSubmitButton({ children, disabled, pendingLabel, ...props }: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>
      {pending ? <><LoaderCircle className="button-spinner" />{pendingLabel}</> : children}
    </button>
  );
}

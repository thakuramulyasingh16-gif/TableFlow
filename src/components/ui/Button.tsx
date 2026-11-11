'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'leaf' | 'sun' | 'tomato' | 'outline-tomato' | 'mint' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  leaf: 'bg-leaf text-surface hover:bg-leaf-mid',
  sun: 'bg-sun text-ink hover:bg-sun-soft',
  tomato: 'bg-tomato text-surface hover:opacity-90',
  'outline-tomato': 'bg-surface text-tomato border-2 border-tomato hover:bg-cream',
  mint: 'bg-mint-bg text-leaf hover:bg-mint',
  ghost: 'bg-transparent text-ink hover:bg-mint-bg',
};

export function Button({
  variant = 'leaf',
  fullWidth = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`min-h-[44px] px-4 py-2.5 rounded-[14px] font-bold text-[14px] inline-flex items-center justify-center gap-2 transition duration-150 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed ${
        VARIANT_CLASSES[variant]
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

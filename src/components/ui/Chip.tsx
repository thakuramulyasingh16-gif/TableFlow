'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

export function Chip({ active = false, className = '', type = 'button', children, ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={`min-h-[44px] px-4 py-2 rounded-full text-[13px] font-bold shrink-0 inline-flex items-center justify-center gap-1.5 transition duration-150 cursor-pointer ${
        active ? 'bg-sun text-ink shadow-sm' : 'bg-mint-bg text-leaf hover:bg-mint'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

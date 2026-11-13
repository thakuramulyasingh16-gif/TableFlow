import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`bg-surface rounded-[20px] shadow-card border border-mint/60 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}


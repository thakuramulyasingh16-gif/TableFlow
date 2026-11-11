'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  variant = 'center',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  variant?: 'center' | 'sheet';
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className={`fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px] flex ${
        variant === 'sheet' ? 'items-end justify-center' : 'items-center justify-center p-4'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-surface text-ink w-full shadow-card overflow-y-auto ${
          variant === 'sheet'
            ? 'max-w-lg rounded-t-[28px] p-5 max-h-[88vh]'
            : 'max-w-md rounded-[20px] p-5 max-h-[90vh]'
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-[18px] font-extrabold text-ink">{title}</h2>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-full bg-mint-bg text-leaf inline-flex items-center justify-center hover:bg-mint cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

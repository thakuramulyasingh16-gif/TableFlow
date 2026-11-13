'use client';

import { Check } from 'lucide-react';

export interface StepItem {
  key: string;
  label: string;
  description: string;
}

const DEFAULT_STEPS: StepItem[] = [
  { key: 'received', label: 'Order received', description: 'Sent to our kitchen host for quick confirmation' },
  { key: 'preparing', label: 'Preparing', description: 'Chefs are freshly cooking your dishes' },
  { key: 'ready', label: 'Ready', description: 'Plated and ready to be brought to your table' },
  { key: 'served', label: 'Served', description: 'Delivered to your table — enjoy your meal!' },
];

export function normalizeOrderStep(status: string): string {
  if (status === 'confirmed') return 'received';
  return status;
}

export function StatusStepper({
  status,
  steps = DEFAULT_STEPS,
}: {
  status: string;
  steps?: StepItem[];
}) {
  const normalized = normalizeOrderStep(status);
  const currentIdx = Math.max(
    0,
    steps.findIndex((s) => s.key === normalized)
  );

  return (
    <ol className="space-y-4" aria-live="polite" aria-label="Order progress">
      {steps.map((step, idx) => {
        const isDone = idx < currentIdx || (normalized === 'served' && idx === currentIdx);
        const isCurrent = !isDone && idx === currentIdx;

        return (
          <li key={step.key} className="flex items-start gap-3.5 relative">
            {idx < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute left-[15px] top-[34px] w-0.5 h-[calc(100%-10px)] ${
                  isDone ? 'bg-veg-green' : 'bg-mint'
                }`}
              />
            )}
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative z-10 transition duration-150 ${
                isDone
                  ? 'bg-veg-green text-surface'
                  : isCurrent
                  ? 'bg-sun text-ink shadow-sun-glow'
                  : 'bg-surface border-2 border-muted/40 text-muted'
              }`}
            >
              {isDone ? (
                <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />
              ) : (
                <span className="text-[12px] font-extrabold">{idx + 1}</span>
              )}
            </span>
            <div className="pt-0.5">
              <div
                className={`text-[15px] font-extrabold ${
                  isDone || isCurrent ? 'text-ink' : 'text-muted'
                }`}
              >
                {step.label}
                {isCurrent && (
                  <span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-sun-soft text-ink">
                    In progress
                  </span>
                )}
                {isDone && (
                  <span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-mint-bg text-leaf">
                    Completed
                  </span>
                )}
              </div>
              <p className="text-[12px] text-muted mt-0.5">{step.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}


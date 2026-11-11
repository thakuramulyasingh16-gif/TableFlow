import type { ReactNode } from 'react';

type BadgeTone = 'mint' | 'sun' | 'tomato' | 'due-soon' | 'ink' | 'leaf';

const TONE_CLASSES: Record<BadgeTone, string> = {
  mint: 'bg-mint-bg text-leaf',
  sun: 'bg-sun-soft text-ink',
  tomato: 'bg-tomato text-surface',
  'due-soon': 'bg-due-soon text-due-soon-ink',
  ink: 'bg-ink text-sun-soft',
  leaf: 'bg-leaf text-surface',
};

export function Badge({
  tone = 'mint',
  className = '',
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold leading-none ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function VegIndicator({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      title={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      className={`w-4 h-4 rounded-[4px] border-2 inline-flex items-center justify-center shrink-0 ${
        isVeg ? 'border-veg-green' : 'border-tomato'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${isVeg ? 'bg-veg-green' : 'bg-tomato'}`}
      />
    </span>
  );
}

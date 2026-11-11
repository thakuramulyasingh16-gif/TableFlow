import { Clock } from 'lucide-react';
import { elapsedMinutes, formatElapsed } from '@/lib/format';

export type TimerState = 'on_time' | 'due_soon' | 'late';

export function getTimerState(createdAt: string | Date): TimerState {
  const mins = elapsedMinutes(createdAt);
  if (mins >= 15) return 'late';
  if (mins >= 8) return 'due_soon';
  return 'on_time';
}

const TIMER_STYLES: Record<TimerState, { label: string; cls: string }> = {
  on_time: { label: 'On time', cls: 'bg-mint-bg text-leaf' },
  due_soon: { label: 'Due soon', cls: 'bg-due-soon text-due-soon-ink' },
  late: { label: 'Late', cls: 'bg-tomato text-surface' },
};

export function TimerChip({ since }: { since: string | Date }) {
  const state = getTimerState(since);
  const meta = TIMER_STYLES[state];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-extrabold ${meta.cls}`}
    >
      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{meta.label}</span>
      <span className="font-mono">· {formatElapsed(since)}</span>
    </span>
  );
}

export function formatInr(paise) {
  const num = Number(paise || 0) / 100;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatElapsed(isoDate) {
  if (!isoDate) return '00:00';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function elapsedMinutes(isoDate) {
  if (!isoDate) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
}

export const SPICE_BADGE = {
  none: { label: 'No Spice', cls: 'bg-stone-100 text-stone-700' },
  mild: { label: 'Mild', cls: 'bg-amber-50 text-amber-700' },
  medium: { label: 'Medium', cls: 'bg-orange-100 text-orange-800' },
  hot: { label: 'Hot', cls: 'bg-red-100 text-red-700' },
  extra_hot: { label: 'Extra Hot', cls: 'bg-rose-200 text-rose-900' },
};

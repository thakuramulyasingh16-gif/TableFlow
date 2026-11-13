'use client';

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-ink text-sun-soft text-[13px] font-bold shadow-card max-w-[90vw] text-center"
    >
      {message}
    </div>
  );
}

